import { describe, expect, it } from 'vitest'
import {
  playerWeekState,
  blankTeams,
  defaultGameweek,
  doubleMarkers,
  groupByDay,
  involvement,
  kickoffTime,
  londonDay,
  matchState,
  unscheduled,
} from './fixtures'
import type { Gameweek, Match, Player, Team } from '../types'

const match = (over: Partial<Match> & Pick<Match, 'id' | 'home' | 'away'>): Match => ({
  event: 1,
  kickoff: '2026-08-22T14:00:00Z',
  homeScore: null,
  awayScore: null,
  started: false,
  finished: false,
  finishedProvisional: false,
  homeDifficulty: null,
  awayDifficulty: null,
  ...over,
})

const TEAMS: Team[] = [
  { id: 1, name: 'Arsenal', shortName: 'ARS', code: 3 },
  { id: 2, name: 'Brentford', shortName: 'BRE', code: 94 },
  { id: 3, name: 'Chelsea', shortName: 'CHE', code: 8 },
  { id: 4, name: 'Everton', shortName: 'EVE', code: 11 },
]

describe('UK time', () => {
  it('converts UTC kickoffs to London, across the clocks going back', () => {
    // BST: 14:00Z is 15:00. GMT: 15:00Z is 15:00.
    expect(kickoffTime('2026-08-22T14:00:00Z')).toBe('15:00')
    expect(kickoffTime('2026-12-26T15:00:00Z')).toBe('15:00')
    // A late kickoff that crosses midnight UTC but not London's.
    expect(londonDay('2026-08-21T23:30:00Z')).toBe('2026-08-22')
    expect(londonDay('2026-12-21T23:30:00Z')).toBe('2026-12-21')
  })
})

describe('grouping by day', () => {
  it('groups in kickoff order and puts undated matches last under their own heading', () => {
    const groups = groupByDay([
      match({ id: 2, home: 1, away: 2, kickoff: '2026-08-23T15:30:00Z' }),
      match({ id: 3, home: 3, away: 4, kickoff: null }),
      match({ id: 1, home: 2, away: 3, kickoff: '2026-08-22T14:00:00Z' }),
      match({ id: 4, home: 4, away: 1, kickoff: '2026-08-22T16:30:00Z' }),
    ])
    expect(groups.map((g) => [g.day, g.matches.map((m) => m.id)])).toEqual([
      ['2026-08-22', [1, 4]],
      ['2026-08-23', [2]],
      [null, [3]],
    ])
    expect(groups[0].heading).toBe('Saturday 22 August')
    expect(groups[2].heading).toBe('Date to be confirmed')
  })
})

describe('blanks and doubles', () => {
  const matches = [
    match({ id: 1, home: 1, away: 2 }),
    match({ id: 2, home: 1, away: 3, kickoff: '2026-08-25T19:00:00Z' }),
  ]

  it('names the clubs with no fixture in the week', () => {
    expect(blankTeams(matches, TEAMS, 1).map((t) => t.shortName)).toEqual(['EVE'])
    expect(blankTeams(matches, TEAMS, 2).map((t) => t.shortName)).toEqual(['ARS', 'BRE', 'CHE', 'EVE'])
  })

  it('numbers each fixture of a club that plays twice', () => {
    const markers = doubleMarkers(matches, 1)
    expect(markers.get(1)?.get(1)).toEqual({ n: 1, of: 2 })
    expect(markers.get(2)?.get(1)).toEqual({ n: 2, of: 2 })
    // The single-fixture sides are not marked.
    expect(markers.get(1)?.get(2)).toBeUndefined()
  })

  it('separates matches with no gameweek rather than dropping them', () => {
    const all = [...matches, match({ id: 9, home: 2, away: 4, event: null, kickoff: null })]
    expect(unscheduled(all).map((m) => m.id)).toEqual([9])
    expect(blankTeams(all, TEAMS, 1).map((t) => t.shortName)).toEqual(['EVE'])
  })
})

describe('state and involvement', () => {
  it('reads the match state from the flags', () => {
    expect(matchState(match({ id: 1, home: 1, away: 2 }))).toBe('upcoming')
    expect(matchState(match({ id: 1, home: 1, away: 2, started: true }))).toBe('live')
    expect(matchState(match({ id: 1, home: 1, away: 2, started: true, finishedProvisional: true }))).toBe('finished')
    expect(matchState(match({ id: 1, home: 1, away: 2, kickoff: null }))).toBe('unscheduled')
  })

  it('splits owned players by side, best first', () => {
    const player = (id: number, teamId: number, points: number, owner: string): Player =>
      ({ id, teamId, points, owner, name: `P${id}` }) as unknown as Player
    const owned = [player(1, 1, 3, 'rushy'), player(2, 2, 9, 'dj'), player(3, 1, 7, 'wood'), player(4, 4, 1, 'jls')]
    const { home, away } = involvement(match({ id: 1, home: 1, away: 2 }), owned)
    expect(home.map((p) => p.id)).toEqual([3, 1])
    expect(away.map((p) => p.id)).toEqual([2])
  })
})

describe('default gameweek', () => {
  const gw = (id: number, finished: boolean) => ({ id, finished }) as Gameweek
  it('opens on the first unfinished gameweek, or the last if the season is done', () => {
    expect(defaultGameweek([gw(1, true), gw(2, true), gw(3, false), gw(4, false)])).toBe(3)
    expect(defaultGameweek([gw(37, true), gw(38, true)])).toBe(38)
  })
})

describe('playerWeekState', () => {
  const m = (id: number, home: number, away: number, started: boolean, finished: boolean): Match =>
    ({
      id,
      event: 1,
      home,
      away,
      kickoff: '2026-08-22T14:00:00Z',
      started,
      finished,
      finishedProvisional: false,
      homeScore: null,
      awayScore: null,
    }) as Match

  it('is blank with no fixture, upcoming before kickoff, started while live, finished after', () => {
    expect(playerWeekState([m(1, 1, 2, false, false)], 1, 9)).toEqual({ state: 'blank', live: false })
    expect(playerWeekState([m(1, 1, 2, false, false)], 1, 1)).toEqual({ state: 'upcoming', live: false })
    expect(playerWeekState([m(1, 1, 2, true, false)], 1, 2)).toEqual({ state: 'started', live: true })
    expect(playerWeekState([m(1, 1, 2, true, true)], 1, 1)).toEqual({ state: 'finished', live: false })
  })

  it('stays on points through a double gameweek once either match has started', () => {
    const double = [m(1, 1, 2, true, true), m(2, 3, 1, false, false)]
    expect(playerWeekState(double, 1, 1)).toEqual({ state: 'started', live: false })
    expect(playerWeekState(double, 1, 3)).toEqual({ state: 'upcoming', live: false })
  })
})
