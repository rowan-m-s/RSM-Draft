import { describe, expect, it } from 'vitest'
import { applySubstitutions } from './substitution.mjs'

/** A 4-4-2: GK 1, DEF 2-5, MID 6-9, FWD 10-11. Bench GK 12, outfield 13-15. */
const POS = {
  1: 'GKP',
  12: 'GKP',
  2: 'DEF',
  3: 'DEF',
  4: 'DEF',
  5: 'DEF',
  6: 'MID',
  7: 'MID',
  8: 'MID',
  9: 'MID',
  10: 'FWD',
  11: 'FWD',
  13: 'DEF',
  14: 'MID',
  15: 'FWD',
}
const positionOf = (el) => POS[el]
const picks = (slots) => slots.map((element, i) => ({ element, position: i + 1 }))
const DEFAULT_PICKS = picks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

function run(picksList, minutesByElement) {
  return applySubstitutions({ picks: picksList, positionOf, minutesOf: (el) => minutesByElement[el] ?? 90 })
}

describe('applySubstitutions', () => {
  it('substitutes a zero-minute starter with bench 1, and marks both sides', () => {
    const result = run(DEFAULT_PICKS, { 10: 0 }) // starting FWD blanked
    const ten = result.find((p) => p.element === 10)
    const thirteen = result.find((p) => p.element === 13) // bench 1, DEF
    expect(ten.starter).toBe(false)
    expect(ten.subbedOff).toBe(true)
    expect(thirteen.starter).toBe(true)
    expect(thirteen.subbedOn).toBe(true)
    // Legal: 1 GKP, 5 DEF, 4 MID, 1 FWD.
    const xi = result.filter((p) => p.starter).map((p) => positionOf(p.element))
    expect(xi.filter((p) => p === 'DEF').length).toBe(5)
    expect(xi.filter((p) => p === 'FWD').length).toBe(1)
  })

  it('skips a bench player who did not play, and the next who did', () => {
    const result = run(DEFAULT_PICKS, { 10: 0, 13: 0 }) // starter and bench 1 both blank
    const thirteen = result.find((p) => p.element === 13)
    const fourteen = result.find((p) => p.element === 14) // bench 2
    expect(thirteen.starter).toBe(false)
    expect(thirteen.subbedOn).toBe(false)
    expect(fourteen.starter).toBe(true)
    expect(fourteen.subbedOn).toBe(true)
  })

  it('skips a bench player who would break the formation, and tries the next', () => {
    // 3 starting defenders exactly at the minimum; the blanked one's only
    // legal replacement is another DEF or a flexible position — bench 1
    // here is a FWD, which would leave DEF at 2, illegal; bench 2 is MID,
    // also illegal at 2 DEF; neither can legally replace a DEF when DEF is
    // already at the floor, so the zero should stand.
    const threeAtBackPicks = picks([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 16, 12, 15, 14, 17])
    const pos = { ...POS, 16: 'MID', 17: 'FWD' } // five mids, two fwd, 3 def starting XI
    const localPositionOf = (el) => pos[el]
    const result = applySubstitutions({
      picks: threeAtBackPicks,
      positionOf: localPositionOf,
      minutesOf: (el) => (el === 4 ? 0 : 90), // the third DEF blanks
    })
    const four = result.find((p) => p.element === 4)
    // Bench is [12 GKP, 15 FWD, 14 MID, 17 FWD] in that priority order —
    // every outfield bench player is FWD or MID, and DEF is already at the
    // 3-player floor, so swapping any of them in for the blanked DEF drops
    // DEF to 2, illegal every time. The zero stands.
    expect(four.starter).toBe(true)
    expect(four.subbedOff).toBe(false)
    const xi = result.filter((p) => p.starter).map((p) => localPositionOf(p.element))
    expect(xi.filter((p) => p === 'DEF').length).toBe(3)
  })

  it('never lets the bench goalkeeper replace an outfield player', () => {
    // Every outfield bench player unavailable (did not play); only the
    // bench GK played. An outfield starter blanks — must stay unsubstituted
    // rather than bring on the keeper.
    const result = run(DEFAULT_PICKS, { 10: 0, 12: 90, 13: 0, 14: 0, 15: 0 })
    const ten = result.find((p) => p.element === 10)
    const twelve = result.find((p) => p.element === 12)
    expect(ten.starter).toBe(true) // zero stands
    expect(ten.subbedOff).toBe(false)
    expect(twelve.starter).toBe(false) // bench GK never comes on for this
  })

  it('brings the bench goalkeeper on only for the starting goalkeeper, unconditionally', () => {
    const result = run(DEFAULT_PICKS, { 1: 0 })
    const one = result.find((p) => p.element === 1)
    const twelve = result.find((p) => p.element === 12)
    expect(one.starter).toBe(false)
    expect(one.subbedOff).toBe(true)
    expect(twelve.starter).toBe(true)
    expect(twelve.subbedOn).toBe(true)
  })

  it('lets the formation change shape rather than preserving it', () => {
    // Starting 4-4-2 (DEF 2-5, MID 6-9, FWD 10-11). Blank one MID; bench 1
    // (element 13) is a DEF, bench GK 12 is GKP — bench order means DEF
    // comes in for the MID gap, since it's tried first and is legal
    // (DEF 5, MID 3, FWD 2 — all within bounds), producing a 5-3-2 from an
    // original 4-4-2. Nothing should force the MID slot to stay a MID.
    const result = run(DEFAULT_PICKS, { 6: 0 })
    const xi = result.filter((p) => p.starter).map((p) => positionOf(p.element))
    const counts = { DEF: 0, MID: 0, FWD: 0, GKP: 0 }
    for (const p of xi) counts[p]++
    expect(counts).toEqual({ GKP: 1, DEF: 5, MID: 3, FWD: 2 })
  })

  it('processes every eligible starter, with a rejected bench player still available for the next', () => {
    // Two starters blank: a DEF (element 2) and the FWD (element 10).
    // Bench in order: 12 GKP, 13 DEF, 14 MID, 15 FWD. For the DEF gap,
    // bench 1 (13, DEF) is tried and legal — comes on. For the FWD gap,
    // bench order continues from what remains: 14 (MID) is tried first and
    // is legal (DEF 5, MID 4, FWD 1), so MID comes on for the FWD gap,
    // leaving bench 3 (15, FWD) unused and available only if needed.
    const result = run(DEFAULT_PICKS, { 2: 0, 10: 0 })
    const two = result.find((p) => p.element === 2)
    const ten = result.find((p) => p.element === 10)
    const thirteen = result.find((p) => p.element === 13)
    const fourteen = result.find((p) => p.element === 14)
    const fifteen = result.find((p) => p.element === 15)
    expect(two.starter).toBe(false)
    expect(ten.starter).toBe(false)
    expect(thirteen.starter).toBe(true)
    expect(fourteen.starter).toBe(true)
    expect(fifteen.starter).toBe(false) // never needed, stays on the bench
  })

  it('leaves everyone alone when every starter played', () => {
    const result = run(DEFAULT_PICKS, {})
    expect(result.filter((p) => p.starter).map((p) => p.element).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ])
    expect(result.every((p) => !p.subbedOn && !p.subbedOff)).toBe(true)
  })
})

describe('applySubstitutions, bench candidates tried in full', () => {
  it('skips an illegal first bench candidate and still subs on a legal later one', () => {
    // Starting XI: 1 GKP, 5 DEF (2-6, at the maximum), 4 MID (7-10), 1 FWD
    // (11, at the minimum). Bench: 12 GKP, 13 DEF, 14 FWD, 15 MID.
    //
    // Element 7 (MID) blanks. Bench 1 (13, DEF) is tried first: DEF would
    // go from 5 to 6, over the maximum — illegal, must be skipped rather
    // than giving up. Bench 2 (14, FWD) is tried next: MID drops to 3
    // (still >= the minimum of 2) and FWD rises to 2 (still <= the maximum
    // of 3) — legal. The sub must go through on this second candidate; if
    // the loop stopped at the first illegal try, this would stay a zero
    // and move the total.
    const pos = {
      1: 'GKP',
      2: 'DEF',
      3: 'DEF',
      4: 'DEF',
      5: 'DEF',
      6: 'DEF',
      7: 'MID',
      8: 'MID',
      9: 'MID',
      10: 'MID',
      11: 'FWD',
      12: 'GKP',
      13: 'DEF',
      14: 'FWD',
      15: 'MID',
    }
    const localPositionOf = (el) => pos[el]
    const localPicks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((element, i) => ({
      element,
      position: i + 1,
    }))
    const result = applySubstitutions({
      picks: localPicks,
      positionOf: localPositionOf,
      minutesOf: (el) => (el === 7 ? 0 : 90),
    })

    const seven = result.find((p) => p.element === 7)
    const thirteen = result.find((p) => p.element === 13) // bench 1, illegal here
    const fourteen = result.find((p) => p.element === 14) // bench 2, legal

    expect(seven.starter).toBe(false)
    expect(seven.subbedOff).toBe(true)
    expect(thirteen.starter).toBe(false) // tried, rejected, stays on the bench
    expect(thirteen.subbedOn).toBe(false)
    expect(fourteen.starter).toBe(true)
    expect(fourteen.subbedOn).toBe(true)

    const xi = result.filter((p) => p.starter).map((p) => localPositionOf(p.element))
    const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const p of xi) counts[p]++
    expect(counts).toEqual({ GKP: 1, DEF: 5, MID: 3, FWD: 2 })
  })
})
