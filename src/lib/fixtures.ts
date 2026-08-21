import type { Gameweek, Match, Player, Team } from '../types'

/**
 * The Fixtures page's arithmetic, kept pure so it can be tested against the
 * cases a naive list gets wrong: blank and double gameweeks, and matches
 * with no gameweek or kickoff yet.
 */

/** The gameweek the page should open on: the one in play, else the next. */
export function defaultGameweek(gameweeks: Gameweek[]): number {
  const open = gameweeks.find((gw) => !gw.finished)
  if (open) return open.id
  return gameweeks.at(-1)?.id ?? 1
}

export function matchesIn(matches: Match[], gameweek: number): Match[] {
  return matches.filter((m) => m.event === gameweek)
}

/** Postponed or otherwise unscheduled: no gameweek attached. */
export function unscheduled(matches: Match[]): Match[] {
  return matches.filter((m) => m.event === null)
}

/** Calendar day in London, as YYYY-MM-DD, for grouping. Null kickoff → null. */
export function londonDay(iso: string | null): string | null {
  if (!iso) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
  return parts
}

export function dayHeading(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))
}

/** Kickoff as UK clock time, 24h. */
export function kickoffTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export interface DayGroup {
  /** YYYY-MM-DD in London, or null for matches with no kickoff yet. */
  day: string | null
  heading: string
  matches: Match[]
}

/** Group a gameweek's matches by London calendar day, in kickoff order. */
export function groupByDay(matches: Match[]): DayGroup[] {
  const sorted = [...matches].sort((a, b) => {
    if (a.kickoff === b.kickoff) return a.id - b.id
    if (a.kickoff === null) return 1
    if (b.kickoff === null) return -1
    return a.kickoff < b.kickoff ? -1 : 1
  })
  const groups: DayGroup[] = []
  for (const match of sorted) {
    const day = londonDay(match.kickoff)
    const last = groups.at(-1)
    if (last && last.day === day) last.matches.push(match)
    else
      groups.push({
        day,
        heading: match.kickoff ? dayHeading(match.kickoff) : 'Date to be confirmed',
        matches: [match],
      })
  }
  return groups
}

/** Clubs with no fixture in the gameweek. */
export function blankTeams(matches: Match[], teams: Team[], gameweek: number): Team[] {
  const playing = new Set(matchesIn(matches, gameweek).flatMap((m) => [m.home, m.away]))
  return teams.filter((t) => !playing.has(t.id))
}

/**
 * Clubs playing more than once in the gameweek, with each of their matches
 * numbered so the second can be marked rather than merely listed twice.
 * Returns match id → { teamId → ordinal } for the teams that double.
 */
export function doubleMarkers(matches: Match[], gameweek: number): Map<number, Map<number, { n: number; of: number }>> {
  const inWeek = [...matchesIn(matches, gameweek)].sort((a, b) => ((a.kickoff ?? '') < (b.kickoff ?? '') ? -1 : 1))
  const perTeam = new Map<number, Match[]>()
  for (const m of inWeek) {
    for (const team of [m.home, m.away]) (perTeam.get(team) ?? perTeam.set(team, []).get(team)!).push(m)
  }
  const out = new Map<number, Map<number, { n: number; of: number }>>()
  for (const [team, list] of perTeam) {
    if (list.length < 2) continue
    list.forEach((m, i) => {
      const entry = out.get(m.id) ?? new Map()
      entry.set(team, { n: i + 1, of: list.length })
      out.set(m.id, entry)
    })
  }
  return out
}

export interface Involvement {
  home: Player[]
  away: Player[]
}

/** Owned players on each side of a match, best scorers first. */
export function involvement(match: Match, owned: Player[]): Involvement {
  const side = (teamId: number) => owned.filter((p) => p.teamId === teamId).sort((a, b) => b.points - a.points)
  return { home: side(match.home), away: side(match.away) }
}

export type MatchState = 'upcoming' | 'live' | 'finished' | 'unscheduled'

export function matchState(match: Match): MatchState {
  if (match.kickoff === null) return 'unscheduled'
  if (match.finished || match.finishedProvisional) return 'finished'
  if (match.started) return 'live'
  return 'upcoming'
}

export type PlayerWeekState = 'blank' | 'upcoming' | 'started' | 'finished'

/**
 * Where a club is in its gameweek, for deciding what a player's card shows:
 * the fixture until it kicks off, points from then on. A double gameweek
 * counts as started once either match has, so points never give way to an
 * upcoming fixture again. `live` is true only while a match is in progress,
 * which is what the card's live tint follows.
 */
export function playerWeekState(
  matches: Match[],
  gameweek: number,
  teamId: number
): { state: PlayerWeekState; live: boolean } {
  const own = matchesIn(matches, gameweek).filter((m) => m.home === teamId || m.away === teamId)
  if (own.length === 0) return { state: 'blank', live: false }
  const states = own.map(matchState)
  const live = states.includes('live')
  if (live) return { state: 'started', live }
  if (states.includes('finished')) {
    return { state: states.every((s) => s === 'finished') ? 'finished' : 'started', live: false }
  }
  return { state: 'upcoming', live: false }
}
