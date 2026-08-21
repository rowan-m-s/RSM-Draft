import { describe, expect, it } from 'vitest'
import {
  buildFixturePoints,
  buildFixtures,
  buildGameweeks,
  buildMonths,
  buildPlayers,
  buildSeason,
  buildSquad,
  buildDraftSquads,
  checkBalanceInvariant,
  inferDraftXI,
  isSettled,
} from './derive.mjs'

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

describe('buildSquad', () => {
  // 1–11 start, 12–15 are the bench in order.
  const picks = Array.from({ length: 15 }, (_, i) => ({ element: 100 + i, position: i + 1 }))

  it('marks the starting eleven', () => {
    const squad = buildSquad({ picks })
    expect(squad.filter((p) => p.starter)).toHaveLength(11)
    expect(squad.find((p) => p.position === 12).starter).toBe(false)
  })

  it('applies an automatic substitution to the scoring eleven', () => {
    // 104 started and did not play; 112 came off the bench for him.
    const squad = buildSquad({ picks, subs: [{ element_out: 104, element_in: 112 }] })
    const out = squad.find((p) => p.element === 104)
    const on = squad.find((p) => p.element === 112)

    expect(out.starter).toBe(false)
    expect(out.subbedOff).toBe(true)
    expect(on.starter).toBe(true)
    expect(on.subbedOn).toBe(true)
    // Still eleven scoring players after the swap.
    expect(squad.filter((p) => p.starter)).toHaveLength(11)
  })

  it('keeps the original position so the bench order still reads correctly', () => {
    // element 100 + i sits at position i + 1, so 112 is the second substitute.
    const squad = buildSquad({ picks, subs: [{ element_out: 104, element_in: 112 }] })
    expect(squad.find((p) => p.element === 112).position).toBe(13)
    // The first substitute is untouched and stays at position 12.
    expect(squad.find((p) => p.position === 12)).toMatchObject({ element: 111, starter: false })
  })

  it('handles several substitutions in one week', () => {
    const squad = buildSquad({
      picks,
      subs: [
        { element_out: 101, element_in: 112 },
        { element_out: 105, element_in: 113 },
      ],
    })
    expect(squad.filter((p) => p.starter)).toHaveLength(11)
    expect(squad.filter((p) => p.subbedOn).map((p) => p.element).sort()).toEqual([112, 113])
  })

  it('accepts the shorter in/out field names too', () => {
    // The exact key names could not be verified before a gameweek was played,
    // so both spellings are handled rather than guessed at.
    const squad = buildSquad({ picks, subs: [{ out: 104, in: 112 }] })
    expect(squad.find((p) => p.element === 112).starter).toBe(true)
  })
})

describe('buildFixtures', () => {
  const fixtures = [
    { event: 1, team_h: 9, team_a: 8, kickoff_time: '2026-08-22T14:00:00Z' },
    { event: 1, team_h: 10, team_a: 6, kickoff_time: '2026-08-24T19:00:00Z' },
    { event: null, team_h: 1, team_a: 2, kickoff_time: null },
  ]

  it('indexes both sides of every fixture by team', () => {
    const { byEvent } = buildFixtures({ fixtures, generatedAt: 'x' })
    expect(byEvent['1']['9']).toEqual([{ opponent: 8, home: true, kickoff: '2026-08-22T14:00:00Z' }])
    expect(byEvent['1']['8']).toEqual([{ opponent: 9, home: false, kickoff: '2026-08-22T14:00:00Z' }])
  })

  it('skips fixtures with no gameweek assigned yet', () => {
    const { byEvent } = buildFixtures({ fixtures, generatedAt: 'x' })
    expect(byEvent['null']).toBeUndefined()
    expect(Object.keys(byEvent)).toEqual(['1'])
  })

  it('keeps every match in a flat list, unscheduled ones last', () => {
    const full = [
      { id: 3, event: 1, team_h: 10, team_a: 6, kickoff_time: '2026-08-24T19:00:00Z', started: true, finished: true, team_h_score: 2, team_a_score: 0, team_h_difficulty: 2, team_a_difficulty: 4 },
      { id: 1, event: 1, team_h: 9, team_a: 8, kickoff_time: '2026-08-22T14:00:00Z' },
      { id: 2, event: null, team_h: 1, team_a: 2, kickoff_time: null },
    ]
    const { matches } = buildFixtures({ fixtures: full, generatedAt: 'x' })
    expect(matches.map((m) => m.id)).toEqual([1, 3, 2])
    expect(matches[1]).toMatchObject({ homeScore: 2, awayScore: 0, finished: true, homeDifficulty: 2, awayDifficulty: 4 })
    expect(matches[2]).toMatchObject({ event: null, kickoff: null, started: false, homeScore: null, homeDifficulty: null })
  })

  it('carries the team table, alphabetically', () => {
    const teams = [
      { id: 2, name: 'Brentford', short_name: 'BRE', code: 94 },
      { id: 1, name: 'Arsenal', short_name: 'ARS', code: 3 },
    ]
    const { teams: out } = buildFixtures({ fixtures: [], teams, generatedAt: 'x' })
    expect(out).toEqual([
      { id: 1, name: 'Arsenal', shortName: 'ARS', code: 3 },
      { id: 2, name: 'Brentford', shortName: 'BRE', code: 94 },
    ])
  })

  it('keeps both games of a double gameweek', () => {
    const { byEvent } = buildFixtures({
      fixtures: [
        { event: 5, team_h: 3, team_a: 4, kickoff_time: 'a' },
        { event: 5, team_h: 7, team_a: 3, kickoff_time: 'b' },
      ],
      generatedAt: 'x',
    })
    expect(byEvent['5']['3']).toHaveLength(2)
  })
})

describe('inferDraftXI', () => {
  /** A squad as 2 GKP, 5 DEF, 5 MID, 3 FWD, drafted in the order given. */
  const squadOf = (positions) => {
    const positionOf = (element) => positions[element - 1]
    const picks = positions.map((_, i) => ({ element: i + 1, pick: i + 1, round: i + 1 }))
    return { picks, positionOf }
  }
  const NORMAL = ['GKP','DEF','MID','FWD','DEF','MID','DEF','MID','FWD','DEF','MID','GKP','DEF','MID','FWD']

  const countBy = (entries, positionOf) =>
    entries.reduce((acc, e) => ((acc[positionOf(e.element)] = (acc[positionOf(e.element)] ?? 0) + 1), acc), {})

  it('picks eleven and benches four', () => {
    const { picks, positionOf } = squadOf(NORMAL)
    const { starters, bench } = inferDraftXI({ picks, positionOf })
    expect(starters).toHaveLength(11)
    expect(bench).toHaveLength(4)
  })

  it('produces a legal formation from a normal draft', () => {
    const { picks, positionOf } = squadOf(NORMAL)
    const { starters, formation } = inferDraftXI({ picks, positionOf })
    const counts = countBy(starters, positionOf)
    expect(counts.GKP).toBe(1)
    expect(counts.DEF).toBeGreaterThanOrEqual(3)
    expect(counts.MID).toBeGreaterThanOrEqual(2)
    expect(counts.FWD).toBeGreaterThanOrEqual(1)
    expect(formation).toMatch(/^\d-\d-\d$/)
  })

  it('stays legal when a manager loads up on one position early', () => {
    // Seven midfielders and both keepers in the first nine picks. Taking the
    // first eleven by draft order would give two keepers and one defender.
    const greedy = ['MID','MID','MID','GKP','MID','MID','GKP','MID','MID','DEF','DEF','DEF','DEF','DEF','FWD']
    const { picks, positionOf } = squadOf([...greedy, 'FWD', 'FWD'].slice(0, 15))
    const { starters, bench } = inferDraftXI({ picks, positionOf })
    const counts = countBy(starters, positionOf)
    expect(counts.GKP).toBe(1)
    expect(counts.DEF).toBeGreaterThanOrEqual(3)
    expect(counts.MID).toBeLessThanOrEqual(5)
    expect(counts.FWD).toBeGreaterThanOrEqual(1)
    expect(starters).toHaveLength(11)
    expect(bench).toHaveLength(4)
  })

  it('never starts two keepers even when both were drafted early', () => {
    const twoKeepersFirst = ['GKP','GKP','DEF','DEF','DEF','MID','MID','MID','FWD','DEF','MID','DEF','MID','FWD','FWD']
    const { picks, positionOf } = squadOf(twoKeepersFirst)
    const { starters } = inferDraftXI({ picks, positionOf })
    expect(countBy(starters, positionOf).GKP).toBe(1)
  })

  it('benches exactly one keeper and three outfielders, keeper first', () => {
    const { picks, positionOf } = squadOf(NORMAL)
    const { bench } = inferDraftXI({ picks, positionOf })
    expect(positionOf(bench[0].element)).toBe('GKP')
    expect(bench.slice(1).map((p) => positionOf(p.element))).not.toContain('GKP')
    expect(bench.filter((p) => positionOf(p.element) === 'GKP')).toHaveLength(1)
  })

  it('prefers the higher pick when filling a minimum', () => {
    // The first defender drafted must start, whoever else is around.
    const { picks, positionOf } = squadOf(NORMAL)
    const { starters } = inferDraftXI({ picks, positionOf })
    const firstDefender = picks.find((p) => positionOf(p.element) === 'DEF')
    expect(starters.map((p) => p.element)).toContain(firstDefender.element)
  })

  it('orders the bench by draft order after the keeper', () => {
    const { picks, positionOf } = squadOf(NORMAL)
    const { bench } = inferDraftXI({ picks, positionOf })
    const outfield = bench.slice(1).map((p) => p.pick)
    expect(outfield).toEqual([...outfield].sort((a, b) => a - b))
  })

  it('fails loudly rather than rendering a broken pitch', () => {
    // A squad with no forward at all cannot make a legal eleven.
    const noForward = ['GKP','GKP','DEF','DEF','DEF','DEF','DEF','MID','MID','MID','MID','MID','DEF','MID','DEF']
    const { picks, positionOf } = squadOf(noForward)
    expect(() => inferDraftXI({ picks, positionOf })).toThrow(/legal XI/)
  })
})

describe('buildDraftSquads', () => {
  const POSITIONS = ['GKP','DEF','MID','FWD','DEF','MID','DEF','MID','FWD','DEF','MID','GKP','DEF','MID','FWD']
  const positionOf = (element) => POSITIONS[(element - 1) % 15]
  const choices = []
  for (let manager = 0; manager < 2; manager++) {
    for (let i = 0; i < 15; i++) {
      choices.push({ entry: 100 + manager, element: manager * 15 + i + 1, index: manager * 15 + i + 1, round: i + 1 })
    }
  }
  const keyByEntryId = new Map([[100, 'rowan'], [101, 'rushy']])

  it('builds a fifteen for every manager, eleven starting', () => {
    const { squads } = buildDraftSquads({ choices, keyByEntryId, positionOf })
    for (const key of ['rowan', 'rushy']) {
      expect(squads[key]).toHaveLength(15)
      expect(squads[key].filter((p) => p.starter)).toHaveLength(11)
    }
  })

  it('numbers the bench 12 to 15 with the keeper at 12', () => {
    const { squads } = buildDraftSquads({ choices, keyByEntryId, positionOf })
    const bench = squads.rowan.filter((p) => !p.starter).sort((a, b) => a.position - b.position)
    expect(bench.map((p) => p.position)).toEqual([12, 13, 14, 15])
    expect(positionOf(bench[0].element)).toBe('GKP')
  })

  it('carries the overall pick number, which is what the cards show', () => {
    const { squads } = buildDraftSquads({ choices, keyByEntryId, positionOf })
    const picks = squads.rowan.map((p) => p.pick).sort((a, b) => a - b)
    expect(picks).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
  })

  it('ignores choices from entries outside the mapping', () => {
    const withStranger = [...choices, { entry: 999, element: 1, index: 999, round: 1 }]
    const { squads } = buildDraftSquads({ choices: withStranger, keyByEntryId, positionOf })
    expect(Object.keys(squads).sort()).toEqual(['rowan', 'rushy'])
  })

  it("numbers each manager's own picks 1 to 15 by overall order, snake or not", () => {
    // A two-manager snake: rowan picks 1, 4, 5, 8, 9 …; rushy 2, 3, 6, 7 ….
    // Delivered out of order to prove the ordinal comes from sorting.
    const snake = []
    const overall = { rowan: [], rushy: [] }
    for (let n = 1; n <= 30; n++) {
      const pair = Math.ceil(n / 2)
      const rowanFirst = pair % 2 === 1
      const key = (n % 2 === 1) === rowanFirst ? 'rowan' : 'rushy'
      overall[key].push(n)
    }
    for (const [key, nums] of Object.entries(overall)) {
      nums.forEach((n, i) => snake.push({ entry: key === 'rowan' ? 100 : 101, element: (key === 'rowan' ? 0 : 15) + i + 1, index: n, round: Math.ceil(n / 2) }))
    }
    snake.reverse()
    const { squads } = buildDraftSquads({ choices: snake, keyByEntryId, positionOf })
    for (const key of ['rowan', 'rushy']) {
      const byOverall = [...squads[key]].sort((a, b) => a.pick - b.pick)
      expect(byOverall.map((p) => p.sequence)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
    }
    // rowan's first pick went 1st overall; rushy's first went 2nd, their second 3rd.
    expect(squads.rushy.find((p) => p.pick === 3).sequence).toBe(2)
    expect(squads.rushy.find((p) => p.pick === 6).sequence).toBe(3)
  })

  it('fails loudly if a manager does not have fifteen distinct picks', () => {
    const fourteen = choices.filter((c) => !(c.entry === 100 && c.index === 7))
    expect(() => buildDraftSquads({ choices: fourteen, keyByEntryId, positionOf })).toThrow(/rowan: expected 15 distinct draft picks, found 14/)
    const duplicated = choices.map((c) => (c.entry === 101 && c.index === 20 ? { ...c, index: 19 } : c))
    expect(() => buildDraftSquads({ choices: duplicated, keyByEntryId, positionOf })).toThrow(/rushy: .*14 distinct/)
  })
})

describe('buildFixturePoints', () => {
  const mins = (v, p) => ({ name: 'Minutes played', stat: 'minutes', value: v, points: p })
  const goal = (v, p) => ({ name: 'Goals scored', stat: 'goals_scored', value: v, points: p })
  const bonus = (v, p) => ({ name: 'Bonus', stat: 'bonus', value: v, points: p })

  it("splits a double gameweek into each fixture's own contribution", () => {
    const live = {
      elements: {
        10: { stats: { total_points: 12 }, explain: [[[mins(90, 2), goal(1, 5)], 101], [[mins(70, 2), goal(0, 0), bonus(3, 3)], 102]] },
        // Points that the explain attributes 2 + 5 = 7 and 2 + 0 + 3 = 5, and
        // the stated week total is 7 + 5 + 1: the parts do not add up.
        11: { stats: { total_points: 13 }, explain: [[[mins(90, 2), goal(1, 5)], 101], [[mins(70, 2), bonus(3, 3)], 102]] },
      },
    }
    const { byFixture, mismatched } = buildFixturePoints({ live })
    expect(byFixture[101][10]).toEqual({ total: 7, components: [mins(90, 2), goal(1, 5)] })
    expect(byFixture[102][10].total).toBe(5)
    expect(byFixture[102][10].components.map((c) => c.stat)).toEqual(['minutes', 'goals_scored', 'bonus'])
    expect(mismatched).toEqual([{ element: 11, explained: 12, total: 13 }])
  })

  it('accepts the object form and limits to the elements asked for', () => {
    const live = {
      elements: {
        5: { stats: { total_points: 2 }, explain: [{ fixture: 7, stats: [{ identifier: 'minutes', value: 60, points: 2 }] }] },
        6: { stats: { total_points: 2 }, explain: [{ fixture: 7, stats: [{ identifier: 'minutes', value: 60, points: 2 }] }] },
      },
    }
    const { byFixture } = buildFixturePoints({ live, elementIds: [5] })
    expect(Object.keys(byFixture[7])).toEqual(['5'])
    expect(byFixture[7][5].components[0]).toEqual({ stat: 'minutes', name: 'minutes', value: 60, points: 2 })
  })

  it('copes with a player who has no explain yet', () => {
    const { byFixture, mismatched } = buildFixturePoints({ live: { elements: { 9: { stats: { total_points: 0 } } } } })
    expect(byFixture).toEqual({})
    expect(mismatched).toEqual([])
  })
})
