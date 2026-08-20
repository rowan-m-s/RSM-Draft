import { describe, expect, it } from 'vitest'
import { buildGameweeks, buildMonths, buildPlayers, buildSeason, checkBalanceInvariant, isSettled } from './derive.mjs'

const KEYS = ['rushy', 'kellett', 'wallis', 'jls', 'paddy', 'bennett', 'wood', 'rowan', 'jason', 'dj', 'ollie']

/** Two August gameweeks and three September ones, matching the real calendar. */
const EVENTS = [
  { id: 1, deadline_time: '2026-08-21T17:30:00Z', waivers_time: '2026-08-20T17:30:00Z', trades_time: '2026-08-19T17:30:00Z', finished: true },
  { id: 2, deadline_time: '2026-08-28T17:30:00Z', waivers_time: '2026-08-27T17:30:00Z', trades_time: '2026-08-26T17:30:00Z', finished: true },
  { id: 3, deadline_time: '2026-09-04T17:30:00Z', waivers_time: '2026-09-03T17:30:00Z', trades_time: '2026-09-02T17:30:00Z', finished: true },
  { id: 4, deadline_time: '2026-09-12T12:30:00Z', waivers_time: '2026-09-11T12:30:00Z', trades_time: '2026-09-10T12:30:00Z', finished: true },
  { id: 5, deadline_time: '2026-09-18T17:30:00Z', waivers_time: '2026-09-17T17:30:00Z', trades_time: '2026-09-16T17:30:00Z', finished: false },
]

const score = (values) => Object.fromEntries(KEYS.map((k, i) => [k, values[i]]))

//                   rushy kellett wallis jls paddy bennett wood rowan jason dj ollie
const SCORES = {
  1: score([51, 70, 44, 62, 29, 47, 33, 55, 41, 36, 24]), // ollie lowest
  2: score([40, 31, 48, 38, 31, 52, 49, 37, 50, 44, 35]), // kellett and paddy tie
  3: score([45, 33, 61, 28, 52, 39, 57, 44, 30, 48, 41]), // jls lowest
  4: score([38, 55, 42, 60, 26, 44, 31, 49, 58, 35, 47]), // paddy lowest
}

const checked = (...ids) => new Map(EVENTS.map((e) => [e.id, ids.includes(e.id)]))

const elementName = (id) => `Player ${id}`
const noPicks = {}

function build({ dataCheckedIds, scores = SCORES, perGw = noPicks }) {
  const gameweeks = buildGameweeks({
    events: EVENTS,
    classicDataCheckedById: checked(...dataCheckedIds),
    scoresByGw: scores,
  })
  const months = buildMonths({ gameweeks, managerKeys: KEYS, perGw, elementName })
  const season = buildSeason({ gameweeks, months, managerKeys: KEYS, generatedAt: '2026-09-20T10:00:00Z' })
  return { gameweeks, months, season }
}

describe('isSettled', () => {
  it('needs Draft finished AND classic data_checked', () => {
    // Draft has no data_checked of its own, and `finished` flips before bonus
    // points are confirmed. Both signals or no money.
    expect(isSettled({ finished: true }, true)).toBe(true)
    expect(isSettled({ finished: true }, false)).toBe(false)
    expect(isSettled({ finished: false }, true)).toBe(false)
    expect(isSettled({ finished: false }, undefined)).toBe(false)
  })
})

describe('buildGameweeks', () => {
  it('attaches no Koch and no money to a finished but unconfirmed week', () => {
    const { gameweeks } = build({ dataCheckedIds: [1, 2, 3] })
    const gw4 = gameweeks.find((gw) => gw.id === 4)
    expect(gw4.finished).toBe(true)
    expect(gw4.dataChecked).toBe(false)
    expect(gw4.kochKeys).toEqual([])
    expect(gw4.charged).toBe(0)
    // The scores are still shown — just marked provisional by the UI.
    expect(gw4.scores.paddy).toBe(26)
  })

  it('charges every manager tied on the lowest score', () => {
    const { gameweeks } = build({ dataCheckedIds: [1, 2, 3, 4] })
    const gw2 = gameweeks.find((gw) => gw.id === 2)
    expect(gw2.kochKeys.sort()).toEqual(['kellett', 'paddy'])
    expect(gw2.charged).toBe(10)
  })

  it('assigns gameweeks to the month of their London deadline', () => {
    const { gameweeks } = build({ dataCheckedIds: [] })
    expect(gameweeks.map((gw) => gw.month)).toEqual(['2026-08', '2026-08', '2026-09', '2026-09', '2026-09'])
  })

  it('carries the waiver and trade deadlines through', () => {
    const { gameweeks } = build({ dataCheckedIds: [] })
    expect(gameweeks[0].waiversUtc).toBe('2026-08-20T17:30:00Z')
    expect(gameweeks[0].tradesUtc).toBe('2026-08-19T17:30:00Z')
  })
})

describe('buildMonths', () => {
  it('grows the pot by charges levied, not by gameweeks played', () => {
    const { months } = build({ dataCheckedIds: [1, 2, 3, 4] })
    const august = months.find((m) => m.id === '2026-08')
    // Two gameweeks, three charges, because GW2 was a two-way tie.
    expect(august.gameweekIds).toEqual([1, 2])
    expect(august.pot).toBe(15)
  })

  it('settles a month only when every gameweek in it is confirmed', () => {
    const { months } = build({ dataCheckedIds: [1, 2, 3] })
    expect(months.find((m) => m.id === '2026-08').settled).toBe(true)
    // September has GW3 confirmed but GW4 and GW5 are not.
    expect(months.find((m) => m.id === '2026-09').settled).toBe(false)
  })

  it('lets a manager who was Koch win the month', () => {
    const { months, gameweeks } = build({ dataCheckedIds: [1, 2, 3, 4] })
    const august = months.find((m) => m.id === '2026-08')
    expect(gameweeks.find((gw) => gw.id === 2).kochKeys).toContain('kellett')
    expect(august.winnerKeys).toEqual(['kellett'])
    expect(august.potPerWinner).toBe(15)
  })

  it('splits the pot evenly between tied monthly winners', () => {
    const tied = {
      ...SCORES,
      1: score([51, 70, 70, 62, 29, 47, 33, 55, 41, 36, 24]),
      2: score([40, 31, 31, 38, 31, 52, 49, 37, 50, 44, 35]),
    }
    const { months } = build({ dataCheckedIds: [1, 2, 3, 4], scores: tied })
    const august = months.find((m) => m.id === '2026-08')
    expect(august.winnerKeys.sort()).toEqual(['kellett', 'wallis'])
    // GW2 is now a three-way tie on 31, so £15 in from that week plus £5 from
    // GW1: a £20 pot, halved.
    expect(august.pot).toBe(20)
    expect(august.potPerWinner).toBe(10)
  })

  it('counts a player only for the gameweeks they were in the scoring XI', () => {
    // Player 100 plays both weeks for rushy; player 200 only in GW1.
    const perGw = {
      1: { scoringXI: { rushy: [100, 200] }, elementPoints: { 100: 6, 200: 12 } },
      2: { scoringXI: { rushy: [100] }, elementPoints: { 100: 9, 200: 20 } },
    }
    const { months } = build({ dataCheckedIds: [1, 2, 3, 4], perGw })
    const august = months.find((m) => m.id === '2026-08')
    // 100 scores 15 across both. 200 scores 12 — its 20 in GW2 was on the
    // bench and must not count.
    expect(august.topPerformerByManager.rushy).toEqual({ playerName: 'Player 100', points: 15, managerKey: 'rushy' })
  })

  it('ignores unconfirmed gameweeks when picking a top performer', () => {
    const perGw = {
      1: { scoringXI: { rushy: [100] }, elementPoints: { 100: 6 } },
      4: { scoringXI: { rushy: [300] }, elementPoints: { 300: 99 } },
    }
    // GW4 is played but not confirmed, so its auto-subs are not final.
    const { months } = build({ dataCheckedIds: [1, 2, 3], perGw })
    const september = months.find((m) => m.id === '2026-09')
    expect(september.topPerformerByManager.rushy).toBeNull()
  })
})

describe('buildSeason', () => {
  it('ranks by season points and shares a rank on a tie', () => {
    const { season } = build({ dataCheckedIds: [1, 2, 3, 4] })
    expect(season.rows[0].rank).toBe(1)
    const ranks = season.rows.map((r) => r.rank)
    // Ranks never decrease and never exceed the row count.
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(Math.max(...ranks)).toBeLessThanOrEqual(KEYS.length)
  })

  it('counts more Koches than gameweeks when a week was tied', () => {
    const { season, gameweeks } = build({ dataCheckedIds: [1, 2, 3, 4] })
    const totalKoches = season.rows.reduce((sum, row) => sum + row.kochCount, 0)
    const confirmedWeeks = gameweeks.filter((gw) => gw.dataChecked).length
    // Five charges across four confirmed weeks. That is correct, not a bug.
    expect(totalKoches).toBe(5)
    expect(totalKoches).toBeGreaterThan(confirmedWeeks)
  })

  it('excludes the entry fee and the season prize from the balance', () => {
    const { season } = build({ dataCheckedIds: [1, 2] })
    const kellett = season.rows.find((r) => r.key === 'kellett')
    // Paid £5 as a Koch in GW2, won the £15 August pot. Balance +£10 — the
    // £10 entry fee is not part of it.
    expect(kellett.forfeits).toBe(5)
    expect(kellett.potsWon).toBe(15)
    expect(kellett.balance).toBe(10)
    expect(season.seasonPrize).toBe(110)
  })
})

describe('the balance invariant', () => {
  it('sums to exactly £0 once every month is settled', () => {
    // Only GW1 and GW2 exist as far as money is concerned, and August is
    // complete, so every pound charged has been paid out.
    const gameweeks = buildGameweeks({
      events: EVENTS.slice(0, 2),
      classicDataCheckedById: new Map([
        [1, true],
        [2, true],
      ]),
      scoresByGw: SCORES,
    })
    const months = buildMonths({ gameweeks, managerKeys: KEYS, perGw: noPicks, elementName })
    const season = buildSeason({ gameweeks, months, managerKeys: KEYS, generatedAt: 'x' })

    expect(months.every((m) => m.settled)).toBe(true)
    const result = checkBalanceInvariant({ season, months })
    expect(result.sum).toBe(0)
    expect(result.ok).toBe(true)
  })

  it('sums to the negative of the unpaid pot mid-month', () => {
    const { season, months } = build({ dataCheckedIds: [1, 2, 3, 4] })
    // August settled and paid out. September has £10 charged across GW3 and
    // GW4 but has not settled, so that tenner is still in the pot.
    const result = checkBalanceInvariant({ season, months })
    expect(result.unpaidPot).toBe(10)
    expect(result.sum).toBe(-10)
    expect(result.ok).toBe(true)
  })

  it('holds when a split pot leaves fractions', () => {
    // Three-way tie for the month means the pot divides into thirds, which do
    // not sum back to the whole in floating point without tolerance.
    const tied = {
      1: score([70, 70, 70, 62, 29, 47, 33, 55, 41, 36, 24]),
      2: score([31, 31, 31, 38, 40, 52, 49, 37, 50, 44, 35]),
    }
    const gameweeks = buildGameweeks({
      events: EVENTS.slice(0, 2),
      classicDataCheckedById: new Map([
        [1, true],
        [2, true],
      ]),
      scoresByGw: tied,
    })
    const months = buildMonths({ gameweeks, managerKeys: KEYS, perGw: noPicks, elementName })
    const season = buildSeason({ gameweeks, months, managerKeys: KEYS, generatedAt: 'x' })

    expect(months[0].winnerKeys).toHaveLength(3)
    expect(checkBalanceInvariant({ season, months }).ok).toBe(true)
  })

  it('holds before a ball is kicked', () => {
    const gameweeks = buildGameweeks({
      events: EVENTS.map((e) => ({ ...e, finished: false })),
      classicDataCheckedById: new Map(),
      scoresByGw: {},
    })
    const months = buildMonths({ gameweeks, managerKeys: KEYS, perGw: noPicks, elementName })
    const season = buildSeason({ gameweeks, months, managerKeys: KEYS, generatedAt: 'x' })

    expect(months).toEqual([])
    expect(season.rows.every((r) => r.balance === 0)).toBe(true)
    expect(checkBalanceInvariant({ season, months })).toMatchObject({ ok: true, sum: 0 })
  })

  it('catches a pot paid out that was never charged', () => {
    // Deliberately corrupt: someone won £20 from a £15 pot.
    const { season, months } = build({ dataCheckedIds: [1, 2] })
    const broken = {
      season: { rows: season.rows.map((r) => (r.key === 'kellett' ? { ...r, balance: r.balance + 5 } : r)) },
      months,
    }
    expect(checkBalanceInvariant(broken).ok).toBe(false)
  })
})

describe('buildPlayers', () => {
  const teams = [
    { id: 1, code: 3, name: 'Arsenal', short_name: 'ARS' },
    { id: 2, code: 43, name: 'Man City', short_name: 'MCI' },
  ]
  const elements = [
    { id: 1, code: 154561, web_name: 'Raya', element_type: 1, team: 1, total_points: 162, points_per_game: '4.4', goals_scored: 0, assists: 0, clean_sheets: 19, bonus: 11, minutes: 3330 },
    { id: 2, code: 223094, web_name: 'Haaland', element_type: 4, team: 2, total_points: 239, points_per_game: '6.8', goals_scored: 27, assists: 8, clean_sheets: 13, bonus: 43, minutes: 2953 },
    { id: 3, code: 209289, web_name: 'Rice', element_type: 3, team: 1, total_points: 184, points_per_game: '5.1', goals_scored: 4, assists: 9, clean_sheets: 18, bonus: 23, minutes: 3100 },
  ]
  // A season in progress, so the real figures are published rather than zeroed.
  const midSeason = { teams, ownerByElementId: new Map(), generatedAt: 'x', gameweeksPlayed: 38 }

  it('splits owned from free agents and finds the leading scorer', () => {
    const result = buildPlayers({ ...midSeason, elements, ownerByElementId: new Map([[2, 'rushy']]) })
    expect(result.owned.map((p) => p.name)).toEqual(['Haaland'])
    expect(result.freeAgents.map((p) => p.name)).toEqual(['Rice', 'Raya'])
    // The banner shows the best in the league whether owned or not.
    expect(result.leadingScorer.name).toBe('Haaland')
  })

  it('builds the photo reference from `code`, which Draft uses instead of `photo`', () => {
    const result = buildPlayers({ ...midSeason, elements })
    expect(result.freeAgents.find((p) => p.name === 'Raya').photoCode).toBe(154561)
    expect(result.freeAgents.find((p) => p.name === 'Raya').clubCode).toBe(3)
  })

  it('ranks within position', () => {
    const result = buildPlayers({ ...midSeason, elements })
    expect(result.freeAgents.find((p) => p.name === 'Haaland').positionRank).toBe(1)
    expect(result.freeAgents.find((p) => p.name === 'Raya').positionRank).toBe(1)
  })
})

describe('pre-season statistics', () => {
  const teams = [{ id: 1, code: 43, name: 'Man City', short_name: 'MCI' }]
  // What FPL actually serves before GW1: last season's totals.
  const elements = [
    { id: 1, code: 223094, web_name: 'Haaland', element_type: 4, team: 1, total_points: 239, points_per_game: '6.8', goals_scored: 27, assists: 8, clean_sheets: 13, bonus: 43, minutes: 2953 },
  ]

  it('zeroes last season’s figures before a gameweek is played', () => {
    const result = buildPlayers({ elements, teams, ownerByElementId: new Map([[1, 'kellett']]), generatedAt: 'x', gameweeksPlayed: 0 })
    // Ownership is real and must survive; the statistics are not this season's.
    expect(result.owned[0].owner).toBe('kellett')
    expect(result.owned[0]).toMatchObject({ points: 0, goals: 0, assists: 0, bonus: 0, ppg: 0 })
    // No leading scorer exists before anyone has scored.
    expect(result.leadingScorer).toBeNull()
  })

  it('passes the real figures through once the season is under way', () => {
    const played = [{ ...elements[0], total_points: 13, goals_scored: 2, assists: 0, bonus: 3, minutes: 90 }]
    const result = buildPlayers({ elements: played, teams, ownerByElementId: new Map(), generatedAt: 'x', gameweeksPlayed: 1 })
    expect(result.freeAgents[0].points).toBe(13)
    expect(result.leadingScorer.name).toBe('Haaland')
  })

  it('refuses to publish if FPL ever serves carryover after kick-off', () => {
    // Nobody can play 2953 minutes in one gameweek. If this ever passes
    // silently, every points figure on the site is last season's.
    expect(() =>
      buildPlayers({ elements, teams, ownerByElementId: new Map(), generatedAt: 'x', gameweeksPlayed: 1 })
    ).toThrow(/impossible/)
  })
})
