/**
 * Every derived value in the site, computed here.
 *
 * Pure functions only — no fetching, no filesystem. fetch-data.mjs does the
 * I/O and hands the raw material in; this turns it into the JSON the React
 * app reads. Keeping it pure is what makes the money invariant testable
 * against fixtures rather than against the live league.
 *
 * The money rules themselves come from src/lib/season.ts, which the app also
 * uses. Node strips the types, so there is one implementation of "who is the
 * Koch" and one set of tests covering it.
 */

import {
  SEASON_PRIZE,
  chargeFor,
  kochesOf,
  londonIso,
  monthLabel,
  monthOfDeadline,
  monthShortLabel,
  monthWinnersOf,
} from '../../src/lib/season.ts'

/**
 * Money only locks once FPL confirms the gameweek.
 *
 * Draft applies automatic substitutions *after* a gameweek finishes, so a week
 * that is merely `finished` can still have its points move. `finished` alone
 * would attach £5 to a number that is not final yet.
 *
 * The Draft API has no `data_checked` field — that lives in the classic FPL
 * game, which shares event ids and deadlines. So a gameweek is settled only
 * when Draft says finished AND classic says data_checked.
 */
export function isSettled(event, classicDataChecked) {
  return Boolean(event.finished) && Boolean(classicDataChecked)
}

/**
 * A manager's running total for a week in play: the scoring XI's points as
 * they stand. FPL writes the official figure only once the week ends, and
 * auto-subs are applied then too, so this is exactly what the official app
 * shows live and is replaced by the official number the moment it exists.
 */
export function provisionalScores(record) {
  const out = {}
  for (const [key, picks] of Object.entries(record?.squads ?? {})) {
    out[key] = picks.filter((p) => p.starter).reduce((sum, p) => sum + (record.elementPoints?.[p.element] ?? 0), 0)
  }
  return out
}

/**
 * Whether every manager has had at least one of their XI's matches kick
 * off. Until then a provisional Koch is meaningless: someone sits on nought
 * because their players have not played, not because they did badly.
 */
export function everyManagerStarted({ record, fixtures, event, teamOfElement }) {
  const startedTeams = new Set()
  for (const f of fixtures) {
    if (f.event === event && f.started) (startedTeams.add(f.team_h), startedTeams.add(f.team_a))
  }
  const squads = Object.entries(record?.squads ?? {})
  if (squads.length === 0) return false
  return squads.every(([, picks]) => picks.some((p) => p.starter && startedTeams.has(teamOfElement(p.element))))
}

/**
 * How many of each manager's XI are still to play: starters with a fixture
 * this gameweek that has not kicked off. In progress counts as started, a
 * blank is not a fixture. What makes a live table readable: a low score
 * with eight to come is not a bad week.
 */
export function yetToPlay({ record, fixtures, event, teamOfElement }) {
  const notStarted = new Set()
  for (const f of fixtures) {
    if (f.event === event && !f.started) (notStarted.add(f.team_h), notStarted.add(f.team_a))
  }
  const out = {}
  for (const [key, picks] of Object.entries(record?.squads ?? {})) {
    out[key] = picks.filter((p) => p.starter && notStarted.has(teamOfElement(p.element))).length
  }
  return out
}

/**
 * The next gameweek's squads before its deadline: each manager's current
 * fifteen, assuming the same XI and bench split as the most recent
 * gameweek's picks. Players picked up since then go on the bench; players
 * who left simply drop out, and no replacement XI is invented. With no
 * played week to copy, all fifteen show as the squad. Addendum 02 §6
 * amended: the week is browsable for its fixtures, clearly provisional.
 */
export function buildPreviewSquads({ managerKeys, ownerByElementId, positionOf, lastSquads = {} }) {
  const ORDER = { GKP: 0, DEF: 1, MID: 2, FWD: 3 }
  const byPosition = (a, b) => (ORDER[positionOf(a)] ?? 9) - (ORDER[positionOf(b)] ?? 9) || a - b
  const owned = {}
  for (const key of managerKeys) owned[key] = new Set()
  for (const [elementId, owner] of ownerByElementId) owned[owner]?.add(elementId)

  return Object.fromEntries(
    managerKeys.map((key) => {
      const previous = (lastSquads[key] ?? []).filter((p) => owned[key].has(p.element))
      const carried = new Set(previous.map((p) => p.element))
      const additions = [...owned[key]].filter((id) => !carried.has(id)).sort(byPosition)
      const picks = [
        // Last week's picks, in their order, keeping who started and who sat.
        ...previous.map((p) => ({ element: p.element, starter: Boolean(p.starter) })),
        // Newly acquired players join the bench until their manager says otherwise.
        ...additions.map((element) => ({ element, starter: previous.length === 0 })),
      ]
      return [key, picks.map((p, i) => ({ ...p, position: i + 1, subbedOn: false, subbedOff: false }))]
    })
  )
}

export function buildGameweeks({
  events,
  classicDataCheckedById,
  scoresByGw,
  perGw = {},
  elementName = String,
  fixtures = [],
  teamOfElement = () => null,
}) {
  // When FPL is expected to confirm a week: it marks data checked the day
  // after the last match, once bonus and auto-subs are final. An estimate
  // for the card's "confirmed 26/08" line, never a gate.
  const lastKickoffByEvent = {}
  for (const f of fixtures) {
    if (f.event == null || !f.kickoff_time) continue
    const current = lastKickoffByEvent[f.event]
    if (!current || f.kickoff_time > current) lastKickoffByEvent[f.event] = f.kickoff_time
  }
  const dayAfter = (iso) => new Date(new Date(iso).getTime() + 24 * 60 * 60 * 1000).toISOString()
  // The breaking news sting is allowed from 09:00 London on the day after
  // the week's last match, and not before, however early FPL confirms.
  // 09:05, not 09:00: FPL locks scores and applies auto-subs at nine on
  // the morning after the last match, and firing on the hour races that
  // flip. Five minutes of headroom; the reveal still also waits for
  // confirmation, whichever is later.
  const revealFrom = (iso) => londonNextDayAt(iso, 9, 5)

  return events.map((event) => {
    const dataChecked = isSettled(event, classicDataCheckedById.get(event.id))
    const record = perGw[event.id]
    // Official totals once the week has finished; until then, the live XI
    // sums, marked provisional. Before kickoff there is nothing to show.
    const inPlay = !event.finished && Boolean(record?.started)
    const scores = event.finished ? (scoresByGw[event.id] ?? {}) : inPlay ? provisionalScores(record) : {}
    const hasScores = Object.keys(scores).length > 0

    // No Koch and no money until the week is confirmed. A finished-but-
    // unconfirmed week shows as provisional with nothing attached.
    const kochKeys = dataChecked && hasScores ? kochesOf(scores) : []

    return {
      id: event.id,
      deadlineUtc: event.deadline_time,
      deadlineLondon: londonIso(event.deadline_time),
      waiversUtc: event.waivers_time ?? null,
      tradesUtc: event.trades_time ?? null,
      month: monthOfDeadline(event.deadline_time),
      finished: Boolean(event.finished),
      /** A match in the week has kicked off. */
      started: Boolean(event.finished) || inPlay,
      /** Scores are live XI sums, not FPL's official figure. */
      scoresProvisional: inPlay && hasScores,
      /** A provisional Koch can be named: nobody is on nought for want of a kickoff. */
      kochReady: Boolean(event.finished) || everyManagerStarted({ record, fixtures, event: event.id, teamOfElement }),
      /** Each manager's starters whose fixture has not kicked off. */
      yetByManager: yetToPlay({ record, fixtures, event: event.id, teamOfElement }),
      /** A fixture in the week has not finished; the Yet column earns its place. */
      fixturesRemaining: fixtures.some((f) => f.event === event.id && !f.finished),
      dataChecked,
      confirmExpectedUtc: lastKickoffByEvent[event.id] ? dayAfter(lastKickoffByEvent[event.id]) : null,
      revealFromUtc: lastKickoffByEvent[event.id] ? revealFrom(lastKickoffByEvent[event.id]) : null,
      scores: hasScores ? scores : {},
      kochKeys,
      charged: chargeFor(kochKeys),
      // Each manager's best player that week. Carried here rather than looked
      // up from a squad file, so expanding a league-table row costs no fetch.
      topPerformerByManager: topPerformersForGameweek({ event, perGw, elementName }),
      // The Koch's scapegoat: lowest scorer who played. Null when nobody has.
      scapegoatByManager: scapegoatsForGameweek({ event, perGw, elementName }),
    }
  })
}

function topPerformersForGameweek({ event, perGw, elementName }) {
  const record = perGw[event.id]
  if (!record) return {}
  const out = {}
  for (const [key, picks] of Object.entries(record.squads ?? {})) {
    let best = null
    for (const pick of picks) {
      if (!pick.starter) continue
      const points = record.elementPoints?.[pick.element] ?? 0
      if (!best || points > best.points) best = { playerName: elementName(pick.element), points, managerKey: key }
    }
    out[key] = best
  }
  return out
}

/**
 * The Koch's scapegoat: the lowest-scoring player in a manager's scoring XI
 * who actually played. Minutes come from the live payload; a player on zero
 * minutes did not play and is not blamed. Ties go to the alphabetical name.
 */
function scapegoatsForGameweek({ event, perGw, elementName }) {
  const record = perGw[event.id]
  if (!record) return {}

  // Everything a player was docked, from the per-fixture breakdown: a missed
  // penalty at -2 outranks a yellow at -1 when both ended on the same total.
  const negativesOf = (element) => {
    let sum = 0
    for (const byElement of Object.values(record.fixturePoints ?? {})) {
      for (const part of byElement[element]?.components ?? []) {
        if (part.points < 0) sum += part.points
      }
    }
    return sum
  }

  const out = {}
  for (const [key, picks] of Object.entries(record.squads ?? {})) {
    let worst = null
    for (const pick of picks) {
      if (!pick.starter) continue
      if ((record.elementMinutes?.[pick.element] ?? 0) <= 0) continue
      const points = record.elementPoints?.[pick.element] ?? 0
      const negatives = negativesOf(pick.element)
      const name = elementName(pick.element)
      // Lowest total; ties go to whoever was docked most, then alphabetical.
      if (
        !worst ||
        points < worst.points ||
        (points === worst.points &&
          (negatives < worst.negatives || (negatives === worst.negatives && name.localeCompare(worst.playerName) < 0)))
      ) {
        worst = { playerName: name, points, negatives, managerKey: key, element: pick.element }
      }
    }
    // The docked sum is a tiebreak, not part of the published shape.
    out[key] = worst
      ? { playerName: worst.playerName, points: worst.points, managerKey: worst.managerKey, element: worst.element }
      : null
  }
  return out
}

/**
 * A player's points *as they counted for a manager*: only the gameweeks where
 * they were in that manager's scoring XI. A striker benched for three weeks
 * does not get credit for those weeks.
 */
export function playerPointsForManager({ gameweekIds, perGw, managerKey }) {
  const totals = new Map()
  for (const gwId of gameweekIds) {
    const gw = perGw[gwId]
    if (!gw) continue
    const xi =
      gw.scoringXI?.[managerKey] ?? (gw.squads?.[managerKey] ?? []).filter((p) => p.starter).map((p) => p.element)
    for (const elementId of xi) {
      const points = gw.elementPoints?.[elementId] ?? 0
      totals.set(elementId, (totals.get(elementId) ?? 0) + points)
    }
  }
  return totals
}

function bestOf(totals, elementName) {
  let bestId = null
  let bestPoints = -Infinity
  for (const [elementId, points] of totals) {
    if (points > bestPoints) {
      bestPoints = points
      bestId = elementId
    }
  }
  if (bestId === null) return null
  return { playerName: elementName(bestId), points: bestPoints }
}

export function buildMonths({ gameweeks, managerKeys, perGw, elementName }) {
  // A month exists from the moment one of its gameweeks has scores, so the
  // Home card can show its provisional leader as things stand; a week in
  // play counts towards the running totals just as it does for the Koch.
  const hasScores = (gw) => Object.keys(gw.scores ?? {}).length > 0
  const monthIds = [...new Set(gameweeks.filter(hasScores).map((gw) => gw.month))].sort()

  return monthIds.map((id) => {
    const played = gameweeks.filter((gw) => gw.month === id && hasScores(gw))
    const allInMonth = gameweeks.filter((gw) => gw.month === id)
    const confirmed = played.filter((gw) => gw.dataChecked)

    const totals = Object.fromEntries(
      managerKeys.map((key) => [key, played.reduce((sum, gw) => sum + (gw.scores[key] ?? 0), 0)])
    )

    // A month settles only when every gameweek in it is confirmed — including
    // ones not played yet, so September cannot settle after its first week.
    const settled = allInMonth.length > 0 && allInMonth.every((gw) => gw.dataChecked)
    const pot = confirmed.reduce((sum, gw) => sum + gw.charged, 0)
    const winnerKeys = settled ? monthWinnersOf(totals) : []

    // Top performers count every week with scores, the one in play
    // included, so the MVP line moves with the table. Until a week is
    // confirmed the scoring XI is the lineup as picked, which is what the
    // official app scores live too.
    const playedIds = played.map((gw) => gw.id)
    const topPerformerByManager = {}
    let topPerformer = null
    for (const key of managerKeys) {
      const best = bestOf(playerPointsForManager({ gameweekIds: playedIds, perGw, managerKey: key }), elementName)
      topPerformerByManager[key] = best ? { ...best, managerKey: key } : null
      if (best && (!topPerformer || best.points > topPerformer.points)) {
        topPerformer = { ...best, managerKey: key }
      }
    }

    return {
      id,
      label: monthLabel(id),
      shortLabel: monthShortLabel(id),
      gameweekIds: played.map((gw) => gw.id),
      totals,
      pot,
      settled,
      winnerKeys,
      potPerWinner: winnerKeys.length ? pot / winnerKeys.length : 0,
      topPerformer,
      topPerformerByManager,
    }
  })
}

export function buildSeason({ gameweeks, months, managerKeys, generatedAt, perGw = {}, elementName = String }) {
  // Season-long best player per manager: points counted only for the weeks
  // they were in that manager's scoring XI, same rule as the monthly figure,
  // and like it counting the week in play.
  const scoredIds = gameweeks.filter((gw) => gw.started).map((gw) => gw.id)
  const seasonBest = {}
  for (const key of managerKeys) {
    const totals = playerPointsForManager({ gameweekIds: scoredIds, perGw, managerKey: key })
    const best = bestOf(totals, elementName)
    seasonBest[key] = best ? { ...best, managerKey: key } : null
  }

  const settledGameweeks = gameweeks.filter((gw) => gw.dataChecked)
  // Finished weeks and the one in play: the table moves during a match.
  const playedGameweeks = gameweeks.filter((gw) => gw.finished || gw.scoresProvisional)
  const latestSettledGameweek = settledGameweeks.at(-1)?.id ?? null

  // The month people are currently in: the one holding the most recent played
  // gameweek, or failing that the one the next deadline falls in.
  const currentMonth = playedGameweeks.at(-1)?.month ?? gameweeks.find((gw) => !gw.finished)?.month ?? null

  const rows = managerKeys.map((key) => {
    const total = playedGameweeks.reduce((sum, gw) => sum + (gw.scores[key] ?? 0), 0)
    const kochCount = gameweeks.filter((gw) => gw.kochKeys.includes(key)).length
    const wonMonths = months.filter((m) => m.winnerKeys.includes(key))
    const forfeits = kochCount * 5
    const potsWon = wonMonths.reduce((sum, m) => sum + m.potPerWinner, 0)

    return {
      key,
      rank: 0,
      total,
      // The latest week with a score, live or final, so the column moves too.
      gw: playedGameweeks.at(-1)?.scores[key] ?? 0,
      month: currentMonth ? (months.find((m) => m.id === currentMonth)?.totals[key] ?? 0) : 0,
      kochCount,
      motmCount: wonMonths.length,
      forfeits,
      potsWon,
      balance: potsWon - forfeits,
      topPerformer: seasonBest[key] ?? null,
    }
  })

  // Rank by season points. Managers level on points share a rank, and the
  // next rank skips accordingly — 1, 2, 2, 4.
  rows.sort((a, b) => b.total - a.total)
  rows.forEach((row, i) => {
    row.rank = i > 0 && row.total === rows[i - 1].total ? rows[i - 1].rank : i + 1
  })

  return {
    rows,
    latestSettledGameweek,
    currentMonth,
    seasonPrize: SEASON_PRIZE,
    leader: buildLeader({ gameweeks }),
    generatedAt,
  }
}

/**
 * Who is top of the table, and for how long.
 *
 * Walked from gameweek history rather than from when the site first noticed
 * a change, so it is right retroactively: cumulative totals are rebuilt at
 * each confirmed gameweek in turn and the set of managers on the highest
 * total noted. The current leaders are that set at the latest confirmed
 * week; `since` is the first week of their unbroken run at the top, and
 * `displaced` is whoever led the week before the run began (null when the
 * run began at GW1 or the previous top was shared).
 *
 * Ties: managers level on points are joint leaders, all named. A run
 * continues through a tie as long as the manager stays in the leading set,
 * so a leader who is joined at the top does not lose their "since" week;
 * the newcomer's run starts at the week they drew level.
 *
 * Null until a gameweek has been confirmed: only confirmed weeks count,
 * because only they can award the £110.
 */
export function buildLeader({ gameweeks }) {
  const withScores = (gw) => Object.keys(gw.scores ?? {}).length > 0
  // Who leads is live: every week with scores, the one in play included.
  // How long they have led is not: the run is dated from confirmed weeks
  // only, so the line holds still while the name can move during a match.
  const scored = gameweeks.filter(withScores)
  if (scored.length === 0) return null
  const confirmed = scored.filter((gw) => gw.dataChecked)

  const sumTo = (weeks) => {
    const totals = {}
    for (const gw of weeks)
      for (const [key, points] of Object.entries(gw.scores)) totals[key] = (totals[key] ?? 0) + points
    return totals
  }
  const leadersOf = (totals) => {
    const top = Math.max(...Object.values(totals))
    return {
      keys: Object.keys(totals)
        .filter((key) => totals[key] === top)
        .sort(),
      total: top,
    }
  }

  const live = leadersOf(sumTo(scored))
  const liveAsOf = scored.at(-1).id

  const leadersByWeek = []
  for (let i = 0; i < confirmed.length; i++)
    leadersByWeek.push({ id: confirmed[i].id, ...leadersOf(sumTo(confirmed.slice(0, i + 1))) })
  const latestConfirmed = leadersByWeek.at(-1) ?? null

  // Each current leader's run: walk back through confirmed weeks while they
  // are in the leading set. A leader only as things stand has no run yet.
  const sinceFor = (key) => {
    let since = null
    for (let i = leadersByWeek.length - 1; i >= 0; i--) {
      if (!leadersByWeek[i].keys.includes(key)) break
      since = leadersByWeek[i].id
    }
    return since
  }
  const runs = live.keys.map((key) => ({ key, since: sinceFor(key) }))
  const dated = runs.filter((r) => r.since !== null)
  // The card's "since" is the longest-standing of the current leaders.
  const since = dated.length > 0 ? Math.min(...dated.map((r) => r.since)) : null
  const weekBefore = since === null ? null : leadersByWeek.find((_, i) => leadersByWeek[i + 1]?.id === since)
  const displaced =
    weekBefore && weekBefore.keys.length === 1 && !live.keys.includes(weekBefore.keys[0]) ? weekBefore.keys[0] : null

  return {
    keys: live.keys,
    total: live.total,
    /** First confirmed week of the run, or null for a lead held only as things stand. */
    since,
    /** The first week of each current leader's own run, for joint leaders. */
    sinceByKey: Object.fromEntries(runs.map((r) => [r.key, r.since])),
    /** The latest week counted, live or confirmed. */
    asOf: liveAsOf,
    /** Confirmed weeks at the top; 0 for a lead held only as things stand. */
    weeks: since === null ? 0 : confirmed.length - confirmed.findIndex((gw) => gw.id === since),
    displaced,
    /** True when the top changed hands at the latest confirmed gameweek. */
    changed: latestConfirmed !== null && since === latestConfirmed.id,
  }
}

const POSITIONS = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' }

/**
 * Injury and availability, verified against the live Draft payload on
 * 20 August 2026 rather than assumed to match the classic game.
 *
 * Draft carries the same fields, and the status codes in use are:
 *
 *   a  available    480 players, never carries news
 *   d  doubtful      28 players, chance 25/50/75  → yellow flag
 *   i  injured       47 players, chance 0         → red flag
 *   s  suspended      3 players, chance 0         → red flag
 *   u  unavailable   37 players, chance 0         → red flag
 *                    (u is mostly players who have left the league —
 *                     "Has joined Paris Saint-Germain permanently")
 *
 * Every non-available player had news text, and no available player did, so
 * the news field is a reliable companion to the flag. The reason is more
 * useful than the colour, which is why it is carried through to the UI.
 */
export function availabilityOf(element) {
  const status = element.status ?? 'a'
  return {
    status,
    // `this_round` is the one that matters once a deadline has passed;
    // before that it is usually null and `next_round` carries the number.
    chanceOfPlaying: element.chance_of_playing_this_round ?? element.chance_of_playing_next_round ?? null,
    news: element.news || null,
    newsAdded: element.news_added ?? null,
  }
}

/**
 * Before a ball is kicked, FPL's `elements` carry *last* season's statistics.
 *
 * That is deliberate on their side — the draft is ranked off those numbers, so
 * people can see who was good last year. But publishing them under a "Season
 * 26/27" banner would show Haaland on 239 points and 27 goals before the
 * season has started, which is simply false.
 *
 * So the stats are zeroed until a gameweek has actually been played, and there
 * is no leading scorer to name. Once GW1 lands FPL resets the counters and the
 * real figures flow through.
 */
/**
 * The season's live statistics per element, read from one gameweek's Draft
 * live payload. Every element, not only the owned ones: the Players page
 * lists free agents too.
 */
export function readElementStats(livePayload) {
  const out = {}
  for (const [id, entry] of Object.entries(livePayload?.elements ?? {})) {
    const st = entry?.stats ?? entry ?? {}
    out[id] = {
      points: Number(st.total_points ?? 0),
      minutes: Number(st.minutes ?? 0),
      goals: Number(st.goals_scored ?? 0),
      assists: Number(st.assists ?? 0),
      cleanSheets: Number(st.clean_sheets ?? 0),
      bonus: Number(st.bonus ?? 0),
    }
  }
  return out
}

/**
 * Season totals per element, summed from the per-gameweek live statistics.
 *
 * Not the bootstrap's `total_points`: before a ball is kicked that carries
 * last season's figures (Haaland on 239 before GW1), and it is a different
 * source from the one the squads and fixtures are scored from, so the pages
 * could disagree. Summing the live weeks means a player's season total is
 * exactly the sum of what the Fixtures page shows for them, it moves during
 * a live gameweek, and it is zero until someone has actually played.
 */
export function sumElementStats(statsByGameweek) {
  const totals = {}
  for (const week of statsByGameweek) {
    for (const [id, st] of Object.entries(week ?? {})) {
      const t = (totals[id] ??= {
        points: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        bonus: 0,
        appearances: 0,
      })
      t.points += st.points
      t.minutes += st.minutes
      t.goals += st.goals
      t.assists += st.assists
      t.cleanSheets += st.cleanSheets
      t.bonus += st.bonus
      if (st.minutes > 0) t.appearances += 1
    }
  }
  return totals
}

export function buildPlayers({ elements, teams, ownerByElementId, generatedAt, statsByGameweek = [] }) {
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const totals = sumElementStats(statsByGameweek)
  const seasonStarted = Object.values(totals).some((t) => t.minutes > 0 || t.points !== 0)
  const zero = { points: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, bonus: 0, appearances: 0 }

  const all = elements.map((element) => {
    const team = teamById.get(element.team)
    const t = totals[String(element.id)] ?? zero
    return {
      id: element.id,
      name: element.web_name,
      position: POSITIONS[element.element_type],
      club: team?.name ?? 'Unknown',
      clubShort: team?.short_name ?? '???',
      // clubCode drives the badge URL; teamId is what fixtures are keyed by.
      // They are different numbers for the same club.
      clubCode: team?.code ?? 0,
      teamId: element.team,
      // Draft's elements carry no `photo` field — the classic API has one, this
      // does not. `code` is the photo reference.
      photoCode: element.code,
      owner: ownerByElementId.get(element.id) ?? null,
      ...availabilityOf(element),
      points: t.points,
      // Per game played, as FPL defines it, to one decimal.
      ppg: t.appearances > 0 ? Math.round((t.points / t.appearances) * 10) / 10 : 0,
      goals: t.goals,
      assists: t.assists,
      cleanSheets: t.cleanSheets,
      bonus: t.bonus,
      positionRank: 0,
    }
  })

  // Rank within position, computed by us. FPL Draft has no prices — players are
  // drafted, not bought — so there is no fee or value to show instead.
  if (seasonStarted) {
    for (const position of Object.values(POSITIONS)) {
      all
        .filter((p) => p.position === position)
        .sort((a, b) => b.points - a.points)
        .forEach((p, i) => (p.positionRank = i + 1))
    }
  }

  const byPoints = (a, b) => b.points - a.points || a.name.localeCompare(b.name)
  const owned = all.filter((p) => p.owner).sort(byPoints)
  const freeAgents = all.filter((p) => !p.owner).sort(byPoints)

  return {
    owned,
    freeAgents,
    // The banner shows the best player in the league, owned or not — but there
    // is no such thing before anyone has scored.
    leadingScorer: seasonStarted ? ([...all].sort(byPoints)[0] ?? null) : null,
    generatedAt,
  }
}

/**
 * The invariant: money only ever moves between managers, so the balances must
 * cancel. Once every gameweek in every month is confirmed the sum is exactly
 * zero; mid-month it is the negative of the pot still sitting unpaid.
 *
 * Called on every fetch. If this is ever false the maths is wrong and the
 * numbers people are settling up against cannot be trusted, so it fails the
 * job rather than publishing.
 */
export function checkBalanceInvariant({ season, months }) {
  const sum = season.rows.reduce((total, row) => total + row.balance, 0)
  const unpaidPot = months.filter((m) => !m.settled).reduce((total, m) => total + m.pot, 0)
  const expected = -unpaidPot

  // Pots split between tied managers can leave thirds; compare with tolerance.
  const ok = Math.abs(sum - expected) < 0.005
  return { ok, sum, expected, unpaidPot }
}

/**
 * Fixtures per event, per team.
 *
 * Draft has no fixtures endpoint of its own, but the classic game serves all
 * 380 in a single call and the two APIs use identical team ids — checked, not
 * assumed. Stored as an array per team because a double gameweek gives a side
 * two fixtures in one event, and a blank gives it none.
 */
export function buildFixtures({ fixtures, teams = [], generatedAt }) {
  // Per team per gameweek, for the squad cards. Unscheduled fixtures have no
  // gameweek to file under, so they only appear in the flat list below.
  const byEvent = {}
  for (const fixture of fixtures) {
    if (fixture.event == null) continue
    const event = (byEvent[fixture.event] ??= {})
    const add = (teamId, opponent, home) => {
      ;(event[teamId] ??= []).push({ opponent, home, kickoff: fixture.kickoff_time ?? null })
    }
    add(fixture.team_h, fixture.team_a, true)
    add(fixture.team_a, fixture.team_h, false)
  }

  // The full season, one record per match, for the Fixtures page. Kept
  // whole rather than trimmed to the weeks in use: it is small, and the page
  // then loads without a second request. Difficulty is FPL's own rating per
  // side, kept because the payload carries it, not invented where it does
  // not. Postponed fixtures keep a null gameweek and kickoff; the page groups
  // those separately rather than dropping them.
  const matches = fixtures
    .map((f) => ({
      id: f.id,
      event: f.event ?? null,
      kickoff: f.kickoff_time ?? null,
      home: f.team_h,
      away: f.team_a,
      homeScore: f.team_h_score ?? null,
      awayScore: f.team_a_score ?? null,
      started: Boolean(f.started),
      finished: Boolean(f.finished),
      finishedProvisional: Boolean(f.finished_provisional),
      homeDifficulty: f.team_h_difficulty ?? null,
      awayDifficulty: f.team_a_difficulty ?? null,
    }))
    .sort((a, b) => {
      if ((a.event ?? 99) !== (b.event ?? 99)) return (a.event ?? 99) - (b.event ?? 99)
      if (a.kickoff !== b.kickoff) return (a.kickoff ?? '') < (b.kickoff ?? '') ? -1 : 1
      return a.id - b.id
    })

  const teamList = teams
    .map((t) => ({ id: t.id, name: t.name, shortName: t.short_name, code: t.code }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { byEvent, matches, teams: teamList, generatedAt }
}

/**
 * One manager's fifteen for one gameweek, as they actually stood that week.
 *
 * Squads change through waivers and trades, so a historical gameweek has to be
 * rendered from that week's picks — showing the current squad with old points
 * attached would list players the manager did not own at the time.
 *
 * Positions 1–11 are the starting XI and 12–15 the bench, in bench order.
 * Draft applies automatic substitutions after the gameweek finishes and reports
 * them in a `subs` array; `starter` reflects the final position after those are
 * applied, and the two flags record who moved so the UI can mark it.
 */
export function buildSquad({ picks, subs = [] }) {
  const subbedOn = new Set()
  const subbedOff = new Set()
  for (const sub of subs) {
    const off = sub.element_out ?? sub.out
    const on = sub.element_in ?? sub.in
    if (typeof off === 'number') subbedOff.add(off)
    if (typeof on === 'number') subbedOn.add(on)
  }

  return picks
    .map((pick) => {
      const startedTheWeek = pick.position >= 1 && pick.position <= 11
      return {
        element: pick.element,
        position: pick.position,
        // Who actually scored: the XI after auto-subs, not before.
        starter: (startedTheWeek && !subbedOff.has(pick.element)) || subbedOn.has(pick.element),
        subbedOn: subbedOn.has(pick.element),
        subbedOff: subbedOff.has(pick.element),
      }
    })
    .sort((a, b) => a.position - b.position)
}

/** The formation a starting XI adds up to, as "3-5-2". */
export function formationOf(starters, positionOf) {
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const entry of starters) counts[positionOf(entry.element)] = (counts[positionOf(entry.element)] ?? 0) + 1
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`
}

/**
 * The squad rules this league plays under, read from the Draft settings
 * payload rather than assumed. Squads are 15 and eleven play.
 */
export const SQUAD_RULES = {
  play: 11,
  min: { GKP: 1, DEF: 3, MID: 2, FWD: 1 },
  max: { GKP: 1, DEF: 5, MID: 5, FWD: 3 },
}

/**
 * Infer a starting eleven from draft order.
 *
 * A drafted squad has no XI: before the first deadline it is just fifteen
 * players. So GW0 shows a plausible one and says so. The rule is the highest
 * drafted valid eleven.
 *
 * Taking the first eleven by draft order alone would routinely produce an
 * illegal team: two keepers, or two defenders if someone went heavy on
 * midfielders early. So the minimums are filled first from each position's
 * highest picks, and only then are the remaining slots filled by draft order
 * across whoever is left.
 *
 * The four not selected become the bench, with the second keeper in the
 * keeper slot, which is where Draft locks it.
 */
export function inferDraftXI({ picks, positionOf }) {
  const byDraftOrder = [...picks].sort((a, b) => a.pick - b.pick)
  const chosen = []
  const taken = new Set()

  const take = (pick) => {
    chosen.push(pick)
    taken.add(pick.element)
  }

  // 1. Minimums, from each position's highest drafted players.
  for (const [position, minimum] of Object.entries(SQUAD_RULES.min)) {
    const available = byDraftOrder.filter((p) => !taken.has(p.element) && positionOf(p.element) === position)
    if (available.length < minimum) {
      throw new Error(`Cannot build a legal XI: needs ${minimum} ${position} but the squad has ${available.length}.`)
    }
    for (const pick of available.slice(0, minimum)) take(pick)
  }

  // 2. Remaining slots by draft order, respecting the per-position maximum.
  for (const pick of byDraftOrder) {
    if (chosen.length >= SQUAD_RULES.play) break
    if (taken.has(pick.element)) continue
    const position = positionOf(pick.element)
    const already = chosen.filter((p) => positionOf(p.element) === position).length
    if (already >= SQUAD_RULES.max[position]) continue
    take(pick)
  }

  if (chosen.length !== SQUAD_RULES.play) {
    throw new Error(`Cannot build a legal XI: assembled ${chosen.length} of ${SQUAD_RULES.play}.`)
  }

  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const pick of chosen) counts[positionOf(pick.element)]++
  for (const position of Object.keys(counts)) {
    if (counts[position] < SQUAD_RULES.min[position] || counts[position] > SQUAD_RULES.max[position]) {
      throw new Error(
        `Inferred XI is not a legal formation: ${counts.GKP}-${counts.DEF}-${counts.MID}-${counts.FWD} ` +
          `(${position} is ${counts[position]}, allowed ${SQUAD_RULES.min[position]} to ${SQUAD_RULES.max[position]}).`
      )
    }
  }

  // Bench in draft order, except the spare keeper, which Draft locks to the
  // first bench slot because an outfielder can never replace him.
  const remaining = byDraftOrder.filter((p) => !taken.has(p.element))
  const benchKeepers = remaining.filter((p) => positionOf(p.element) === 'GKP')
  const benchOutfield = remaining.filter((p) => positionOf(p.element) !== 'GKP')
  const bench = [...benchKeepers, ...benchOutfield]

  // The pitch reads better with each row in draft order within its position.
  const order = { GKP: 0, DEF: 1, MID: 2, FWD: 3 }
  const starters = [...chosen].sort(
    (a, b) => order[positionOf(a.element)] - order[positionOf(b.element)] || a.pick - b.pick
  )

  return { starters, bench, formation: `${counts.DEF}-${counts.MID}-${counts.FWD}` }
}

/**
 * GW0: every manager's squad as drafted, with an inferred XI.
 *
 * `index` from the choices payload is the overall pick number, 1 to 165, which
 * is what the cards show. `round` and `pick` are the round and the pick within
 * it, kept because they are the natural way to talk about a draft.
 *
 * `sequence` is the manager's own ordinal, 1 to 15: their first pick, their
 * second, and so on. It is derived by sorting each manager's picks by overall
 * number rather than from the round, because in a snake draft the ordinal
 * is not a function of the overall number. Every manager must end up with
 * exactly 1 to 15, and the build fails if not.
 */
export function buildDraftSquads({ choices, keyByEntryId, positionOf }) {
  const byManager = {}
  for (const choice of choices) {
    const key = keyByEntryId.get(choice.entry)
    if (!key) continue
    ;(byManager[key] ??= []).push({ element: choice.element, pick: choice.index, round: choice.round })
  }

  for (const [key, picks] of Object.entries(byManager)) {
    picks.sort((a, b) => a.pick - b.pick)
    picks.forEach((p, i) => {
      p.sequence = i + 1
    })
    const overall = picks.map((p) => p.pick)
    if (picks.length !== 15 || new Set(overall).size !== 15) {
      throw new Error(
        `${key}: expected 15 distinct draft picks, found ${picks.length} (${new Set(overall).size} distinct). ` +
          `The draft sequence cannot be numbered.`
      )
    }
  }

  const squads = {}
  const formations = {}
  for (const [key, picks] of Object.entries(byManager)) {
    let inferred
    try {
      inferred = inferDraftXI({ picks, positionOf })
    } catch (error) {
      throw new Error(`${key}: ${error.message}`)
    }
    formations[key] = inferred.formation

    squads[key] = [
      ...inferred.starters.map((p, i) => ({
        element: p.element,
        position: i + 1,
        starter: true,
        subbedOn: false,
        subbedOff: false,
        points: 0,
        pick: p.pick,
        round: p.round,
        sequence: p.sequence,
      })),
      ...inferred.bench.map((p, i) => ({
        element: p.element,
        position: 12 + i,
        starter: false,
        subbedOn: false,
        subbedOff: false,
        points: 0,
        pick: p.pick,
        round: p.round,
        sequence: p.sequence,
      })),
    ]
  }

  return { squads, formations }
}

/**
 * Per-fixture points for the players in play, from the Draft live payload.
 *
 * Draft's `explain` is a list of [components, fixtureId] pairs, one per
 * fixture the player appeared in that week, each component carrying the
 * stat, its value and the points it earned under Draft's own scoring. That
 * attribution is what the Fixtures page shows, so it is taken as given
 * rather than rebuilt from raw stats, and a double gameweek falls out
 * naturally: each pair is one fixture's contribution. The classic API's
 * object form ({ fixture, stats }) is accepted too, in case the shape
 * moves, but the points are always Draft's.
 *
 * Returns { byFixture: { fixtureId: { elementId: { total, components } } } }
 * and a list of elements whose per-fixture parts do not add up to their
 * week total, which the caller logs: it means the explain is not what was
 * expected and the breakdown should not be trusted.
 */
export function buildFixturePoints({ live, elementIds }) {
  const byFixture = {}
  const mismatched = []
  const wanted = elementIds ? new Set(elementIds.map(String)) : null
  for (const [id, entry] of Object.entries(live?.elements ?? {})) {
    if (wanted && !wanted.has(String(id))) continue
    const explain = entry?.explain
    if (!Array.isArray(explain)) continue
    let sum = 0
    for (const item of explain) {
      let components
      let fixtureId
      if (Array.isArray(item)) {
        ;[components, fixtureId] = item
      } else if (item && typeof item === 'object') {
        components = item.stats
        fixtureId = item.fixture
      }
      if (!Array.isArray(components) || fixtureId == null) continue
      const parts = components
        .map((c) => ({
          stat: String(c.stat ?? c.identifier ?? ''),
          name: String(c.name ?? c.stat ?? c.identifier ?? ''),
          value: Number(c.value ?? 0),
          points: Number(c.points ?? 0),
        }))
        // Only what scored. A defender with ninety minutes and a clean sheet
        // is two lines, not eight of "assists 0".
        .filter((c) => c.stat && c.points !== 0)
      const total = parts.reduce((n, c) => n + c.points, 0)
      sum += total
      ;(byFixture[fixtureId] ??= {})[id] = { total, components: parts }
    }
    const weekTotal = entry?.stats?.total_points ?? entry?.total_points
    if (typeof weekTotal === 'number' && explain.length > 0 && sum !== weekTotal) {
      mismatched.push({ element: Number(id), explained: sum, total: weekTotal })
    }
  }
  return { byFixture, mismatched }
}

/**
 * The UTC instant of a given London wall-clock hour on the calendar day
 * after `iso`, in London. Found by taking the London date of `iso`, adding a
 * day, and asking Intl what UTC instant shows that hour in London, allowing
 * for BST or GMT on that day.
 */
export function londonNextDayAt(iso, hour, minute = 0) {
  const fmt = (d) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  const [y, m, d] = fmt(new Date(iso)).split('-').map(Number)
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1)) // the next London calendar date, as a UTC date
  const wanted = nextDate.toISOString().slice(0, 10)
  const base = Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth(), nextDate.getUTCDate(), hour, minute)
  // London is UTC+0 or UTC+1; whichever candidate Intl shows at the wanted
  // hour on the wanted London date is the one.
  for (const offsetHours of [1, 0]) {
    const candidate = new Date(base - offsetHours * 3600 * 1000)
    const h = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(candidate)
    )
    if (h % 24 === hour && fmt(candidate) === wanted) return candidate.toISOString()
  }
  return new Date(base).toISOString()
}
