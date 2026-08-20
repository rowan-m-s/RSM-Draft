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

export function buildGameweeks({ events, classicDataCheckedById, scoresByGw, perGw = {}, elementName = String }) {
  return events.map((event) => {
    const dataChecked = isSettled(event, classicDataCheckedById.get(event.id))
    const scores = scoresByGw[event.id] ?? {}
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
      dataChecked,
      scores: hasScores ? scores : {},
      kochKeys,
      charged: chargeFor(kochKeys),
      // Each manager's best player that week. Carried here rather than looked
      // up from a squad file, so expanding a league-table row costs no fetch.
      topPerformerByManager: topPerformersForGameweek({ event, perGw, elementName }),
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
 * A player's points *as they counted for a manager*: only the gameweeks where
 * they were in that manager's scoring XI. A striker benched for three weeks
 * does not get credit for those weeks.
 */
function playerPointsForManager({ gameweekIds, perGw, managerKey }) {
  const totals = new Map()
  for (const gwId of gameweekIds) {
    const gw = perGw[gwId]
    if (!gw) continue
    const xi = gw.scoringXI?.[managerKey] ?? (gw.squads?.[managerKey] ?? []).filter((p) => p.starter).map((p) => p.element)
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
  const monthIds = [...new Set(gameweeks.filter((gw) => gw.finished).map((gw) => gw.month))].sort()

  return monthIds.map((id) => {
    const played = gameweeks.filter((gw) => gw.month === id && gw.finished)
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

    // Top performers use confirmed gameweeks only. Before a week is checked,
    // auto-subs have not been applied and the scoring XI is not final.
    const confirmedIds = confirmed.map((gw) => gw.id)
    const topPerformerByManager = {}
    let topPerformer = null
    for (const key of managerKeys) {
      const best = bestOf(playerPointsForManager({ gameweekIds: confirmedIds, perGw, managerKey: key }), elementName)
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
  // they were in that manager's scoring XI, same rule as the monthly figure.
  const confirmedIds = gameweeks.filter((gw) => gw.dataChecked).map((gw) => gw.id)
  const seasonBest = {}
  for (const key of managerKeys) {
    const totals = playerPointsForManager({ gameweekIds: confirmedIds, perGw, managerKey: key })
    const best = bestOf(totals, elementName)
    seasonBest[key] = best ? { ...best, managerKey: key } : null
  }

  const settledGameweeks = gameweeks.filter((gw) => gw.dataChecked)
  const playedGameweeks = gameweeks.filter((gw) => gw.finished)
  const latestSettledGameweek = settledGameweeks.at(-1)?.id ?? null

  // The month people are currently in: the one holding the most recent played
  // gameweek, or failing that the one the next deadline falls in.
  const currentMonth =
    playedGameweeks.at(-1)?.month ?? gameweeks.find((gw) => !gw.finished)?.month ?? null

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
      gw: latestSettledGameweek ? (gameweeks.find((g) => g.id === latestSettledGameweek)?.scores[key] ?? 0) : 0,
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

  return { rows, latestSettledGameweek, currentMonth, seasonPrize: SEASON_PRIZE, generatedAt }
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
export function buildPlayers({ elements, teams, ownerByElementId, generatedAt, gameweeksPlayed = 0 }) {
  const teamById = new Map(teams.map((t) => [t.id, t]))
  const seasonStarted = gameweeksPlayed > 0

  // If FPL ever stops resetting at the rollover, last season's totals would
  // silently inflate this season's table. Nobody can play more minutes than
  // there have been minutes to play — allowing for double gameweeks and a
  // generous margin. Tripping this means the reset assumption has broken.
  if (seasonStarted) {
    const ceiling = 90 * 2 * gameweeksPlayed + 90
    const worst = elements.reduce((max, e) => (e.minutes > max.minutes ? e : max), elements[0])
    if (worst.minutes > ceiling) {
      throw new Error(
        `${worst.web_name} has ${worst.minutes} minutes after ${gameweeksPlayed} gameweek(s), which is ` +
          `impossible (ceiling ${ceiling}). FPL looks to be serving last season's statistics, so every ` +
          `points figure would be wrong. Refusing to publish.`
      )
    }
  }

  const all = elements.map((element) => {
    const team = teamById.get(element.team)
    if (!seasonStarted) {
      return {
        id: element.id,
        name: element.web_name,
        position: POSITIONS[element.element_type],
        club: team?.name ?? 'Unknown',
        clubShort: team?.short_name ?? '???',
        clubCode: team?.code ?? 0,
        teamId: element.team,
        photoCode: element.code,
        owner: ownerByElementId.get(element.id) ?? null,
        ...availabilityOf(element),
        points: 0,
        ppg: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        bonus: 0,
        positionRank: 0,
      }
    }
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
      points: element.total_points,
      ppg: Number(element.points_per_game) || 0,
      goals: element.goals_scored,
      assists: element.assists,
      cleanSheets: element.clean_sheets,
      bonus: element.bonus,
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
export function buildFixtures({ fixtures, generatedAt }) {
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
  return { byEvent, generatedAt }
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
      throw new Error(
        `Cannot build a legal XI: needs ${minimum} ${position} but the squad has ${available.length}.`
      )
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
 */
export function buildDraftSquads({ choices, keyByEntryId, positionOf }) {
  const byManager = {}
  for (const choice of choices) {
    const key = keyByEntryId.get(choice.entry)
    if (!key) continue
    ;(byManager[key] ??= []).push({ element: choice.element, pick: choice.index, round: choice.round })
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
      })),
    ]
  }

  return { squads, formations }
}
