/**
 * Phase 2 mock data. Deleted in Phase 4 when the real JSON files land.
 *
 * Deliberately shaped to exercise the awkward cases:
 *   - GW2 is a tied Koch week, so August's pot is £15 off two gameweeks
 *   - kellett is a Koch in GW2 *and* wins August, because that is allowed
 *   - August is settled, September is in progress
 *   - GW5 is finished but not data-checked, so it shows provisional with no £
 *   - one deliberately over-long team name, to see what overflows
 */

import type { Gameweek, League, ManagerKey, Month, PlayersFile, Season, SeasonRow } from '../types'
import { chargeFor, kochesOf, monthLabel, monthShortLabel, monthWinnersOf } from '../lib/season'
import playersJson from './players.json'

const now = new Date()
/** Fifteen minutes ago, so the freshness indicator shows a normal value. */
export const MOCK_GENERATED_AT = new Date(now.getTime() - 14 * 60_000).toISOString()

export const mockLeague: League = {
  name: 'RSM Draft',
  displayName: 'FPL Draft 26/27',
  season: '2026/27',
  generatedAt: MOCK_GENERATED_AT,
  managers: [
    { key: 'rushy', displayName: 'Rushy', entryId: 121885, realName: 'Joshua Rushton', teamName: "Ben Mee 'over" },
    { key: 'kellett', displayName: 'Kellett', entryId: 121879, realName: 'Jacob Kellett', teamName: 'Palmer Violets' },
    {
      key: 'wallis',
      displayName: 'Wallis',
      entryId: 256533,
      realName: 'Tom Wallis',
      // The overflow test. Real team names are shorter, but nothing stops
      // someone renaming mid-season and every layout has to survive it.
      teamName: 'Ten Hag Me If You Can United Athletic',
    },
    { key: 'jls', displayName: 'JLS', entryId: 121881, realName: 'James Lathom-Sharp', teamName: 'Fosters on Draft' },
    { key: 'paddy', displayName: 'Paddy', entryId: 121878, realName: 'Paddy Sykes', teamName: 'Pique Blinders' },
    {
      key: 'bennett',
      displayName: 'Bennett',
      entryId: 321194,
      realName: 'Matthew Bennett',
      teamName: 'Benney and the Nets',
    },
    { key: 'wood', displayName: 'Wood', entryId: 121880, realName: 'Blake Wood', teamName: 'Estêvão Engine' },
    { key: 'rowan', displayName: 'Rowan', entryId: 121877, realName: 'Rowan Shaw', teamName: 'Wirtz Case Scenario' },
    { key: 'jason', displayName: 'Jason', entryId: 121882, realName: 'Jason Smith', teamName: 'Mac To The Future' },
    { key: 'dj', displayName: 'DJ', entryId: 121883, realName: 'Harry Glover', teamName: 'Kasumu-nity Shield' },
    { key: 'ollie', displayName: 'Ollie', entryId: 121884, realName: 'Oliver Simmons', teamName: 'Kinder Mbeumo' },
  ],
}

export const MOCK_KEYS = mockLeague.managers.map((m) => m.key)

/** Real deadlines from this season's bootstrap, so the calendar is honest. */
const DEADLINES: Record<number, { deadline: string; waivers: string; trades: string }> = {
  1: { deadline: '2026-08-21T17:30:00Z', waivers: '2026-08-20T17:30:00Z', trades: '2026-08-19T17:30:00Z' },
  2: { deadline: '2026-08-28T17:30:00Z', waivers: '2026-08-27T17:30:00Z', trades: '2026-08-26T17:30:00Z' },
  3: { deadline: '2026-09-04T17:30:00Z', waivers: '2026-09-03T17:30:00Z', trades: '2026-09-02T17:30:00Z' },
  4: { deadline: '2026-09-12T12:30:00Z', waivers: '2026-09-11T12:30:00Z', trades: '2026-09-10T12:30:00Z' },
  5: { deadline: '2026-09-18T17:30:00Z', waivers: '2026-09-17T17:30:00Z', trades: '2026-09-16T17:30:00Z' },
  6: { deadline: '2026-10-10T10:00:00Z', waivers: '2026-10-09T10:00:00Z', trades: '2026-10-08T10:00:00Z' },
  7: { deadline: '2026-10-17T10:00:00Z', waivers: '2026-10-16T10:00:00Z', trades: '2026-10-15T10:00:00Z' },
  8: { deadline: '2026-10-23T17:30:00Z', waivers: '2026-10-22T17:30:00Z', trades: '2026-10-21T17:30:00Z' },
  9: { deadline: '2026-10-31T11:00:00Z', waivers: '2026-10-30T11:00:00Z', trades: '2026-10-29T11:00:00Z' },
}

/** Scores in the 20–70 range, ordered to match mockLeague.managers. */
const RAW_SCORES: Record<number, number[]> = {
  //     rushy kellett wallis jls paddy bennett wood rowan jason dj ollie
  1: [51, 70, 44, 62, 29, 47, 33, 55, 41, 36, 24],
  2: [40, 31, 48, 38, 31, 52, 49, 37, 50, 44, 35],
  3: [45, 33, 61, 28, 52, 39, 57, 44, 30, 48, 41],
  4: [38, 55, 42, 60, 26, 44, 31, 49, 58, 35, 47],
  5: [29, 47, 36, 51, 44, 25, 62, 33, 40, 58, 30],
}

const MONTH_OF: Record<number, string> = { 1: '2026-08', 2: '2026-08', 3: '2026-09', 4: '2026-09', 5: '2026-09' }

function scoresFor(gw: number): Record<ManagerKey, number> {
  const row = RAW_SCORES[gw]
  return Object.fromEntries(MOCK_KEYS.map((key, i) => [key, row[i]])) as Record<ManagerKey, number>
}

export const mockGameweeks: Gameweek[] = Object.keys(DEADLINES)
  .map(Number)
  .map((id) => {
    const played = id in RAW_SCORES
    // GW5 has finished but FPL has not confirmed bonus points yet, so no money
    // attaches to it and the UI must show it as provisional.
    const dataChecked = played && id !== 5
    const scores = played ? scoresFor(id) : ({} as Record<ManagerKey, number>)
    const kochKeys = dataChecked ? kochesOf(scores) : []
    return {
      id,
      deadlineUtc: DEADLINES[id].deadline,
      deadlineLondon: DEADLINES[id].deadline,
      waiversUtc: DEADLINES[id].waivers,
      tradesUtc: DEADLINES[id].trades,
      month: MONTH_OF[id] ?? '2026-10',
      finished: played,
      dataChecked,
      scores,
      kochKeys,
      charged: chargeFor(kochKeys),
    }
  })

export const mockPlayedGameweeks = mockGameweeks.filter((gw) => gw.finished)

const TOP_PERFORMERS: Record<string, { playerName: string; managerKey: ManagerKey; points: number }> = {
  '2026-08': { playerName: 'Haaland', managerKey: 'rushy', points: 34 },
  '2026-09': { playerName: 'Saka', managerKey: 'wood', points: 41 },
}

function buildMonth(id: string): Month {
  const gameweeks = mockGameweeks.filter((gw) => gw.month === id && gw.finished)
  const totals = Object.fromEntries(
    MOCK_KEYS.map((key) => [key, gameweeks.reduce((sum, gw) => sum + (gw.scores[key] ?? 0), 0)])
  ) as Record<ManagerKey, number>

  // A month settles only when every one of its gameweeks is data-checked.
  const allGameweeksInMonth = mockGameweeks.filter((gw) => gw.month === id)
  const settled = allGameweeksInMonth.length > 0 && allGameweeksInMonth.every((gw) => gw.dataChecked)
  const pot = gameweeks.reduce((sum, gw) => sum + gw.charged, 0)
  const winnerKeys = settled ? monthWinnersOf(totals) : []

  return {
    id,
    label: monthLabel(id),
    shortLabel: monthShortLabel(id),
    gameweekIds: gameweeks.map((gw) => gw.id),
    totals,
    pot,
    settled,
    winnerKeys,
    potPerWinner: winnerKeys.length ? pot / winnerKeys.length : 0,
    topPerformer: TOP_PERFORMERS[id] ?? null,
  }
}

export const mockMonths: Month[] = ['2026-08', '2026-09'].map(buildMonth)

const LATEST_SETTLED = 4
const CURRENT_MONTH = '2026-09'

function buildSeason(): Season {
  const rows: SeasonRow[] = MOCK_KEYS.map((key) => {
    const total = mockPlayedGameweeks.reduce((sum, gw) => sum + (gw.scores[key] ?? 0), 0)
    const kochCount = mockGameweeks.filter((gw) => gw.kochKeys.includes(key)).length
    const motmCount = mockMonths.filter((m) => m.winnerKeys.includes(key)).length
    const forfeits = kochCount * 5
    const potsWon = mockMonths
      .filter((m) => m.winnerKeys.includes(key))
      .reduce((sum, m) => sum + m.potPerWinner, 0)
    return {
      key,
      rank: 0,
      total,
      gw: mockGameweeks.find((g) => g.id === LATEST_SETTLED)!.scores[key] ?? 0,
      month: mockMonths.find((m) => m.id === CURRENT_MONTH)!.totals[key] ?? 0,
      kochCount,
      motmCount,
      forfeits,
      potsWon,
      balance: potsWon - forfeits,
    }
  })

  rows.sort((a, b) => b.total - a.total)
  rows.forEach((row, i) => (row.rank = i + 1))

  return {
    rows,
    latestSettledGameweek: LATEST_SETTLED,
    currentMonth: CURRENT_MONTH,
    seasonPrize: 110,
    generatedAt: MOCK_GENERATED_AT,
  }
}

export const mockSeason = buildSeason()

export const mockPlayers = { ...playersJson, generatedAt: MOCK_GENERATED_AT } as unknown as PlayersFile

export const managerByKey = new Map(mockLeague.managers.map((m) => [m.key, m]))
export const seasonRowByKey = new Map(mockSeason.rows.map((r) => [r.key, r]))
