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
  /** Element codes with a file in public/images/players/. */
  playerImageOverrides: number[]
  /** Gameweeks that have a squad to show. 0 is the initial draft. */
  availableSquads: number[]
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
  /** Each manager's best player that week. Empty before the week is played. */
  topPerformerByManager: Record<ManagerKey, TopPerformer | null>
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
  /** Best player across the season, counted only for weeks they started. */
  topPerformer: TopPerformer | null
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
  /** What fixtures are keyed by. A different number from clubCode. */
  teamId: number
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
  /** FPL availability: 'a' available, 'd' doubtful, 'i'/'s'/'u' ruled out. */
  status: string
  chanceOfPlaying: number | null
  news: string | null
  newsAdded: string | null
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

/** One fixture for one team in one gameweek. */
export interface Fixture {
  /** Opponent's team id. */
  opponent: number
  home: boolean
  kickoff: string | null
}

/** One real Premier League match, for the Fixtures page. */
export interface Match {
  id: number
  /** Null when postponed and not yet rescheduled. */
  event: number | null
  /** Kickoff in UTC. Null when not yet scheduled. */
  kickoff: string | null
  home: number
  away: number
  homeScore: number | null
  awayScore: number | null
  started: boolean
  finished: boolean
  finishedProvisional: boolean
  /** FPL's own fixture difficulty rating per side, 1 to 5. */
  homeDifficulty: number | null
  awayDifficulty: number | null
}

export interface Team {
  id: number
  name: string
  shortName: string
  /** Drives the badge URL: /badges/{size}/t{code}.png */
  code: number
}

/** One scoring component of a player's points in one fixture, as Draft explains it. */
export interface PointsComponent {
  stat: string
  name: string
  value: number
  points: number
}

/** Per-fixture points for the owned players in one gameweek: data/points/gw{N}.json. */
export interface PointsFile {
  event: number
  started: boolean
  finished: boolean
  dataChecked: boolean
  /** fixture id → element id → that fixture's contribution. */
  byFixture: Record<string, Record<string, { total: number; components: PointsComponent[] }>>
  generatedAt: string
}

export interface FixturesFile {
  /** event id → team id → fixtures (an array: double gameweeks exist). */
  byEvent: Record<string, Record<string, Fixture[]>>
  /** Every match of the season, gameweek then kickoff order; unscheduled last. */
  matches: Match[]
  teams: Team[]
  generatedAt: string
}

/** A player as they sat in one manager's squad for one gameweek. */
export interface SquadPick {
  element: number
  /** 1-11 started, 12-15 bench in bench order. */
  position: number
  /** In the scoring XI after auto-subs were applied. */
  starter: boolean
  subbedOn: boolean
  subbedOff: boolean
  points: number
  /** GW0 only: overall draft pick number, 1 to 165. */
  pick?: number
  /** GW0 only: draft round. */
  round?: number
  /** GW0 only: the manager's own ordinal, 1 to 15, by overall pick order. */
  sequence?: number
}

/** Enough detail to render a player without consulting players.json — a
 *  player traded away weeks ago will not be in the current owned list. */
export interface SquadPlayer {
  name: string
  position: Position
  teamId: number
  clubShort: string
  clubCode: number
  photoCode: number
  status: string
  chanceOfPlaying: number | null
  news: string | null
  newsAdded: string | null
}

export interface SquadFile {
  event: number
  /** GW0: the initial draft, with an XI inferred from pick order. */
  isDraft?: boolean
  deadlineUtc: string
  started: boolean
  finished: boolean
  dataChecked: boolean
  squads: Record<ManagerKey, SquadPick[]>
  players: Record<string, SquadPlayer>
  generatedAt: string
}
