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

export function buildGameweeks({ events, classicDataCheckedById, scoresByGw }) {
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
    }
  })
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
    for (const elementId of gw.scoringXI?.[managerKey] ?? []) {
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

export function buildSeason({ gameweeks, months, managerKeys, generatedAt }) {
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

export function buildPlayers({ elements, teams, ownerByElementId, generatedAt }) {
  const teamById = new Map(teams.map((t) => [t.id, t]))

  const all = elements.map((element) => {
    const team = teamById.get(element.team)
    return {
      id: element.id,
      name: element.web_name,
      position: POSITIONS[element.element_type],
      club: team?.name ?? 'Unknown',
      clubShort: team?.short_name ?? '???',
      clubCode: team?.code ?? 0,
      // Draft's elements carry no `photo` field — the classic API has one, this
      // does not. `code` is the photo reference: /photos/players/*/p{code}.png
      photoCode: element.code,
      owner: ownerByElementId.get(element.id) ?? null,
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
  for (const position of Object.values(POSITIONS)) {
    all
      .filter((p) => p.position === position)
      .sort((a, b) => b.points - a.points)
      .forEach((p, i) => (p.positionRank = i + 1))
  }

  const byPoints = (a, b) => b.points - a.points || a.name.localeCompare(b.name)
  const owned = all.filter((p) => p.owner).sort(byPoints)
  const freeAgents = all.filter((p) => !p.owner).sort(byPoints)

  return {
    owned,
    freeAgents,
    // The banner shows the best player in the league, owned or not.
    leadingScorer: [...all].sort(byPoints)[0] ?? null,
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
