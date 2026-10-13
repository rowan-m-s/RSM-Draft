import { describe, expect, it } from 'vitest'
import { reconcile } from './reconciliation.mjs'

const KEYS = ['a', 'b', 'c']

const squad = (starters, bench = []) => [
  ...starters.map((element) => ({ element, starter: true })),
  ...bench.map((element) => ({ element, starter: false })),
]

describe('reconcile', () => {
  it('matches on every front when our result exactly agrees with FPL', () => {
    const ourSquads = { a: squad([1, 2]), b: squad([3, 4]), c: squad([5, 6]) }
    const points = { 1: 5, 2: 5, 3: 10, 4: 0, 5: 1, 6: 1 }
    const result = reconcile({
      managerKeys: KEYS,
      ourSquads,
      ourElementPoints: points,
      fplSquads: ourSquads,
      fplScores: { a: 10, b: 10, c: 2 },
    })
    expect(result.perManager.a).toMatchObject({ xiMatch: true, totalMatch: true, mismatchSource: null })
    expect(result.perManager.c.ourTotal).toBe(2)
    // c is the sole lowest on both sides.
    expect(result.ourKochKeys).toEqual(['c'])
    expect(result.fplKochKeys).toEqual(['c'])
    expect(result.kochMatch).toBe(true)
  })

  it('attributes a mismatch to substitution logic when the XI itself differs', () => {
    // We started element 2; FPL's own pass subbed in element 7 instead.
    const ourSquads = { a: squad([1, 2]), b: squad([3, 4]), c: squad([5, 6]) }
    const fplSquads = { a: squad([1, 7]), b: squad([3, 4]), c: squad([5, 6]) }
    const points = { 1: 5, 2: 5, 3: 10, 4: 0, 5: 1, 6: 1, 7: 2 }
    const result = reconcile({
      managerKeys: KEYS,
      ourSquads,
      ourElementPoints: points,
      fplSquads,
      fplScores: { a: 7, b: 10, c: 2 }, // FPL's own total: 1 + 7's points (5+2)
    })
    expect(result.perManager.a.xiMatch).toBe(false)
    expect(result.perManager.a.mismatchSource).toBe('substitution')
    expect(result.perManager.a.totalMatch).toBe(false)
    expect(result.perManager.a.totalDelta).toBe(10 - 7)
  })

  it('attributes a mismatch to the points themselves when the XI matches but the total does not', () => {
    // Same starters both sides, but FPL's confirmed total differs — a late
    // stat or bonus correction, not a substitution disagreement.
    const squads = { a: squad([1, 2]), b: squad([3, 4]), c: squad([5, 6]) }
    const points = { 1: 5, 2: 5, 3: 10, 4: 0, 5: 1, 6: 1 }
    const result = reconcile({
      managerKeys: KEYS,
      ourSquads: squads,
      ourElementPoints: points,
      fplSquads: squads,
      fplScores: { a: 9, b: 10, c: 2 }, // FPL says 9, we had 10
    })
    expect(result.perManager.a).toMatchObject({ xiMatch: true, totalMatch: false, mismatchSource: 'points', totalDelta: 1 })
  })

  it('makes a Koch mismatch loud and explicit, including when the gap is a tie one side and not the other', () => {
    const squads = { a: squad([1]), b: squad([2]), c: squad([3]) }
    const points = { 1: 5, 2: 5, 3: 10 }
    // We had a clean tie for lowest between a and b; FPL's confirmed figures
    // break it — only b ends up lowest.
    const result = reconcile({
      managerKeys: KEYS,
      ourSquads: squads,
      ourElementPoints: points,
      fplSquads: squads,
      fplScores: { a: 6, b: 4, c: 10 },
    })
    expect(result.ourKochKeys).toEqual(['a', 'b'])
    expect(result.fplKochKeys).toEqual(['b'])
    expect(result.kochMatch).toBe(false)
  })

  it('treats a manager missing from one side as zero rather than throwing', () => {
    const result = reconcile({
      managerKeys: KEYS,
      ourSquads: { a: squad([1]), b: squad([2]) },
      ourElementPoints: { 1: 5, 2: 5 },
      fplSquads: { a: squad([1]), b: squad([2]) },
      fplScores: { a: 5, b: 5 },
    })
    expect(result.perManager.c).toMatchObject({ xiMatch: true, ourTotal: 0, fplTotal: 0, totalMatch: true })
  })
})
