/**
 * The shapes the React app reads. Phase 3's fetch script writes exactly these
 * into public/data/*.json — every derived value is computed in Node so the
 * components stay dumb.
 */

export const MANAGER_KEYS = [
  'rushy',
  'kellett',
  'wallis',
  'jls',
  'paddy',
  'bennett',
  'wood',
  'rowan',
  'jason',
  'dj',
  'ollie',
] as const

export type ManagerKey = (typeof MANAGER_KEYS)[number]

export interface Manager {
  key: ManagerKey
  displayName: string
  /** FPL entry id — the one that goes in the /entry/{id}/ URLs. */
  entryId: number
  /** The manager's own name, as FPL knows it. */
  realName: string
  /** Their FPL team name. Can be long; layouts must not assume otherwise. */
  teamName: string
}

export interface League {
  /** The league's name in FPL: 'RSM Draft'. */
  name: string
  /** What we show in the chrome: 'FPL Draft 26/27'. */
  displayName: string
  season: string
  managers: Manager[]
  generatedAt: string
}

export interface Gameweek {
  id: number
  /** Raw from FPL, always UTC. */
  deadlineUtc: string
  /** Same instant rendered in Europe/London, for display only. */
  deadlineLondon: string
  /** Draft-only deadlines. Waivers close 24h before, trades 48h. */
  waiversUtc: string | null
  tradesUtc: string | null
  /** Calendar month of the deadline *in Europe/London*, as YYYY-MM. */
  month: string
  finished: boolean
  /** From the classic FPL API — Draft has no such field. Money gate. */
  dataChecked: boolean
  scores: Record<ManagerKey, number>
  /**
   * Everyone tied on the lowest score. Empty while the week is provisional.
   * More than one entry is normal and means everyone tied pays.
   */
  kochKeys: ManagerKey[]
  /** £5 per Koch. Zero until the week is settled. */
  charged: number
}

export interface TopPerformer {
  playerName: string
  managerKey: ManagerKey
  points: number
}

export interface Month {
  /** YYYY-MM. */
  id: string
  /** 'September 2026'. */
  label: string
  /** 'September'. */
  shortLabel: string
  gameweekIds: number[]
  totals: Record<ManagerKey, number>
  /** Sum of `charged` across the month's settled gameweeks. */
  pot: number
  /** True once every gameweek in the month is data-checked. */
  settled: boolean
  /** Split evenly on a tie. Empty until settled. */
  winnerKeys: ManagerKey[]
  /** pot / winnerKeys.length, or 0. */
  potPerWinner: number
  topPerformer: TopPerformer | null
  /** Each manager's own best player that month. Null until a week is confirmed. */
  topPerformerByManager: Record<ManagerKey, TopPerformer | null>
}

export interface SeasonRow {
  key: ManagerKey
  rank: number
  /** Cumulative season points. */
  total: number
  /** Latest settled gameweek's score. */
  gw: number
  /** Current month's running total. */
  month: number
  kochCount: number
  motmCount: number
  /** £ charged in forfeits, as a positive number. */
  forfeits: number
  /** £ won from monthly pots. */
  potsWon: number
  /** potsWon − forfeits. Starts at £0; entry fee is not part of it. */
  balance: number
}

export interface Season {
  rows: SeasonRow[]
  /** The gameweek `gw` refers to, or null before any week settles. */
  latestSettledGameweek: number | null
  /** The month `month` refers to. */
  currentMonth: string | null
  seasonPrize: number
  generatedAt: string
}

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

export interface Player {
  id: number
  name: string
  position: Position
  club: string
  clubShort: string
  /** Drives the badge URL: /badges/{size}/t{clubCode}.png */
  clubCode: number
  /** Drives the photo URL: /photos/players/{size}/p{photoCode}.png */
  photoCode: number
  /** null for a free agent. */
  owner: ManagerKey | null
  points: number
  ppg: number
  goals: number
  assists: number
  cleanSheets: number
  bonus: number
  /** Rank within position by points. Computed by us; FPL Draft has no prices. */
  positionRank: number
}

export interface PlayersFile {
  owned: Player[]
  freeAgents: Player[]
  leadingScorer: Player | null
  generatedAt: string
}

export interface HonoursEntry {
  season: string
  key: ManagerKey
  image: string
}

/** One award as the Honours page lists it. */
export interface Award {
  key: ManagerKey
  /** 'GW3' or 'September 2026'. */
  label: string
  /** Sortable: gameweek id, or the month's YYYY-MM. */
  monthId: string
  detail: string
}
