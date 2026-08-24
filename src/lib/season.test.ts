import { describe, expect, it } from 'vitest'
import {
  chargeFor,
  gameweekPoints,
  kochesOf,
  londonIso,
  monthOfDeadline,
  monthWinnersOf,
  nextDeadline,
  relativeAge,
  remainingUntil,
} from './season'
import type { ManagerKey } from '../types'

describe('monthOfDeadline', () => {
  it('reads the month in Europe/London, not UTC', () => {
    // British Summer Time: 23:30 UTC on 31 August is 00:30 on 1 September in
    // London. Reading the UTC string would file this under August and move a
    // whole gameweek's worth of pot into the wrong month.
    expect(monthOfDeadline('2026-08-31T23:30:00Z')).toBe('2026-09')
  })

  it('agrees with UTC outside BST', () => {
    // GMT: no offset, so the 31st stays in December.
    expect(monthOfDeadline('2026-12-31T23:30:00Z')).toBe('2026-12')
  })

  it('handles a deadline early on the 1st during BST', () => {
    expect(monthOfDeadline('2026-09-01T00:30:00Z')).toBe('2026-09')
  })

  it('assigns this season’s real deadlines correctly', () => {
    expect(monthOfDeadline('2026-08-21T17:30:00Z')).toBe('2026-08')
    // 31 Oct 2026 11:00Z — clocks went back on 25 Oct, so this is 11:00 GMT.
    expect(monthOfDeadline('2026-10-31T11:00:00Z')).toBe('2026-10')
    expect(monthOfDeadline('2027-01-02T13:30:00Z')).toBe('2027-01')
  })
})

describe('londonIso', () => {
  it('adds the BST offset in summer', () => {
    expect(londonIso('2026-08-21T17:30:00Z')).toBe('2026-08-21T18:30:00+01:00')
  })

  it('stays on UTC in winter', () => {
    expect(londonIso('2026-12-26T13:30:00Z')).toBe('2026-12-26T13:30:00+00:00')
  })

  it('rolls the date over when BST pushes past midnight', () => {
    // The case the month-boundary rule exists for.
    expect(londonIso('2026-08-31T23:30:00Z')).toBe('2026-09-01T00:30:00+01:00')
  })

  it('agrees with monthOfDeadline', () => {
    for (const iso of ['2026-08-31T23:30:00Z', '2026-12-31T23:30:00Z', '2026-10-31T11:00:00Z']) {
      expect(londonIso(iso).slice(0, 7)).toBe(monthOfDeadline(iso))
    }
  })
})

const scores = (values: Partial<Record<ManagerKey, number>>) => values as Record<ManagerKey, number>

describe('kochesOf and the all-pay tie', () => {
  it('picks the single lowest scorer', () => {
    const gw = scores({ rushy: 44, kellett: 31, wallis: 58 })
    expect(kochesOf(gw)).toEqual(['kellett'])
    expect(chargeFor(kochesOf(gw))).toBe(5)
  })

  it('charges every manager tied on the lowest score', () => {
    const gw = scores({ rushy: 40, kellett: 31, wallis: 58, paddy: 31 })
    expect(kochesOf(gw).sort()).toEqual(['kellett', 'paddy'])
    // Two Koches, so the pot grows by £10 for this one gameweek.
    expect(chargeFor(kochesOf(gw))).toBe(10)
  })

  it('grows the pot by charges levied, not by gameweeks played', () => {
    const week1 = kochesOf(scores({ rushy: 51, kellett: 70, ollie: 24 }))
    const week2 = kochesOf(scores({ rushy: 40, kellett: 31, ollie: 31 }))
    const pot = chargeFor(week1) + chargeFor(week2)
    // Two gameweeks, three charges: £15, not £10.
    expect(pot).toBe(15)
  })

  it('charges everyone when all eleven tie', () => {
    const all = Object.fromEntries(
      ['rushy', 'kellett', 'wallis', 'jls', 'paddy', 'bennett', 'wood', 'rowan', 'jason', 'dj', 'ollie'].map((k) => [
        k,
        42,
      ])
    ) as Record<ManagerKey, number>
    expect(kochesOf(all)).toHaveLength(11)
    expect(chargeFor(kochesOf(all))).toBe(55)
  })

  it('handles negative scores', () => {
    expect(kochesOf(scores({ rushy: -3, kellett: 0 }))).toEqual(['rushy'])
  })
})

describe('monthWinnersOf', () => {
  it('returns one winner normally', () => {
    expect(monthWinnersOf(scores({ rushy: 91, kellett: 101, wallis: 92 }))).toEqual(['kellett'])
  })

  it('returns every manager tied on top, for an even split', () => {
    expect(monthWinnersOf(scores({ rushy: 101, kellett: 101, wallis: 92 })).sort()).toEqual(['kellett', 'rushy'])
  })

  it('lets a Koch win the month', () => {
    // kellett was worst in one week and still has the highest monthly total.
    // Nothing in the rules excludes them.
    const monthly = scores({ rushy: 91, kellett: 101, paddy: 60 })
    const koches = kochesOf(scores({ rushy: 40, kellett: 31, paddy: 31 }))
    expect(koches).toContain('kellett')
    expect(monthWinnersOf(monthly)).toEqual(['kellett'])
  })
})

describe('balances sum to zero', () => {
  // Money only moves between managers, so once a month is fully settled the
  // eleven balances must cancel exactly. Mid-month the sum is the negative of
  // the pot still sitting unpaid.
  const keys: ManagerKey[] = [
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
  ]

  const balances = (forfeits: Partial<Record<ManagerKey, number>>, pots: Partial<Record<ManagerKey, number>>) =>
    keys.map((k) => (pots[k] ?? 0) - (forfeits[k] ?? 0))

  it('sums to £0 for a settled month, including a tied week', () => {
    // GW1 ollie pays £5. GW2 kellett and paddy tie and pay £5 each.
    // Pot is £15 and kellett wins it.
    const sum = balances({ ollie: 5, kellett: 5, paddy: 5 }, { kellett: 15 }).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })

  it('sums to £0 when a tied month splits the pot', () => {
    const sum = balances({ ollie: 10 }, { kellett: 5, wallis: 5 }).reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)
  })

  it('sums to the negative of the unpaid pot mid-month', () => {
    // August settled (£15 in, £15 out). September has £10 charged, unpaid.
    const sum = balances({ ollie: 5, kellett: 5, paddy: 10, jls: 5 }, { kellett: 15 }).reduce((a, b) => a + b, 0)
    expect(sum).toBe(-10)
  })
})

describe('nextDeadline', () => {
  const gameweeks = [
    { id: 1, deadlineUtc: '2026-08-21T17:30:00Z' },
    { id: 2, deadlineUtc: '2026-08-28T17:30:00Z' },
    { id: 3, deadlineUtc: '2026-09-04T17:30:00Z' },
  ]

  it('finds the first deadline still in the future', () => {
    expect(nextDeadline(gameweeks, new Date('2026-08-22T00:00:00Z'))?.id).toBe(2)
  })

  it('skips a deadline that passed while the JSON went stale', () => {
    // The data might still claim GW2 is "next". It is not, at this instant.
    expect(nextDeadline(gameweeks, new Date('2026-08-28T18:00:00Z'))?.id).toBe(3)
  })

  it('returns null once the season is over', () => {
    expect(nextDeadline(gameweeks, new Date('2027-06-01T00:00:00Z'))).toBeNull()
  })

  it('is not fooled by unsorted input', () => {
    const shuffled = [gameweeks[2], gameweeks[0], gameweeks[1]]
    expect(nextDeadline(shuffled, new Date('2026-08-01T00:00:00Z'))?.id).toBe(1)
  })
})

describe('remainingUntil', () => {
  it('breaks the gap into days, hours, minutes and seconds', () => {
    const r = remainingUntil('2026-08-21T17:30:00Z', new Date('2026-08-20T16:29:55Z'))
    expect(r).toMatchObject({ days: 1, hours: 1, minutes: 0, seconds: 5 })
  })

  it('flags the final hour as urgent', () => {
    expect(remainingUntil('2026-08-21T17:30:00Z', new Date('2026-08-21T16:45:00Z')).urgent).toBe(true)
    expect(remainingUntil('2026-08-21T17:30:00Z', new Date('2026-08-21T16:15:00Z')).urgent).toBe(false)
  })

  it('clamps at zero rather than counting negative', () => {
    const r = remainingUntil('2026-08-21T17:30:00Z', new Date('2026-08-22T00:00:00Z'))
    expect(r.totalMs).toBe(0)
    expect(r.urgent).toBe(false)
  })
})

describe('relativeAge', () => {
  it('reads in minutes and flags nothing when fresh', () => {
    const a = relativeAge('2026-08-20T10:00:00Z', new Date('2026-08-20T10:14:00Z'))
    expect(a.text).toBe('14 minutes ago')
    expect(a.stale).toBe(false)
  })

  it('flags anything past three hours as stale', () => {
    const a = relativeAge('2026-08-20T06:00:00Z', new Date('2026-08-20T09:30:00Z'))
    expect(a.text).toBe('3 hours ago')
    expect(a.stale).toBe(true)
  })

  it('falls back to days for a long-dead job', () => {
    expect(relativeAge('2026-08-18T10:00:00Z', new Date('2026-08-20T10:00:00Z')).text).toBe('2 days ago')
  })
})

describe('gameweekPoints', () => {
  const pick = (starter: boolean, points: number) => ({ starter, points })
  const squads = {
    a: [pick(true, 10), pick(true, 8), pick(false, 6)],
    b: [pick(true, 30), pick(false, 0)],
    c: [pick(true, 18), pick(false, 1)],
    d: [pick(true, 2), pick(false, 9)],
  }

  it('splits XI and bench and ranks the XI among the file, sharing ties', () => {
    expect(gameweekPoints(squads, 'a')).toEqual({ xi: 18, bench: 6, rank: 2, of: 4 })
    expect(gameweekPoints(squads, 'c')).toEqual({ xi: 18, bench: 1, rank: 2, of: 4 })
    expect(gameweekPoints(squads, 'b')).toEqual({ xi: 30, bench: 0, rank: 1, of: 4 })
    expect(gameweekPoints(squads, 'd')).toEqual({ xi: 2, bench: 9, rank: 4, of: 4 })
  })

  it('is null for a manager not in the file', () => {
    expect(gameweekPoints(squads, 'zz')).toBeNull()
  })
})
