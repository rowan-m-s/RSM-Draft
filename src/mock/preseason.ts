/**
 * The state the site actually launches in: eleven managers, no gameweek played,
 * no Koch, no Manager of the Month, nothing won.
 *
 * That is four or five weeks of empty cards in the most prominent position on
 * the page, so the empty states get designed properly rather than discovered in
 * August. Reachable at `?state=preseason`.
 */

import type { Dataset } from '../data'
import type { ManagerKey, SeasonRow } from '../types'
import { MOCK_GENERATED_AT, mockGameweeks, mockLeague, MOCK_KEYS } from './index'
import { monthLabel, monthShortLabel } from '../lib/season'

const emptyScores = {} as Record<ManagerKey, number>

const gameweeks = mockGameweeks.map((gw) => ({
  ...gw,
  finished: false,
  dataChecked: false,
  scores: emptyScores,
  kochKeys: [],
  charged: 0,
}))

const zeroTotals = Object.fromEntries(MOCK_KEYS.map((key) => [key, 0])) as Record<ManagerKey, number>

const months = ['2026-08', '2026-09'].map((id) => ({
  id,
  label: monthLabel(id),
  shortLabel: monthShortLabel(id),
  gameweekIds: [],
  totals: zeroTotals,
  pot: 0,
  settled: false,
  winnerKeys: [],
  potPerWinner: 0,
  topPerformer: null,
}))

const rows: SeasonRow[] = MOCK_KEYS.map((key, i) => ({
  key,
  rank: i + 1,
  total: 0,
  gw: 0,
  month: 0,
  kochCount: 0,
  motmCount: 0,
  forfeits: 0,
  potsWon: 0,
  balance: 0,
}))

export const preseason: Dataset = {
  league: mockLeague,
  gameweeks,
  months,
  season: {
    rows,
    latestSettledGameweek: null,
    currentMonth: null,
    seasonPrize: 110,
    generatedAt: MOCK_GENERATED_AT,
  },
  // Nobody has drafted yet, so every player is a free agent.
  players: { owned: [], freeAgents: [], leadingScorer: null, generatedAt: MOCK_GENERATED_AT },
  generatedAt: MOCK_GENERATED_AT,
}
