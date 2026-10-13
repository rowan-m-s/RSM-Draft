import { describe, expect, it } from 'vitest'
import {
  ASSUMED_MATCH_DURATION_MS,
  DEFAULT_FINALISATION_BUFFER_MS,
  fixturesMissingBonus,
  isLocallyFinalised,
} from './finalisation.mjs'

const KICKOFF = '2026-10-10T14:00:00Z'
const LAST_KICKOFF = new Date(KICKOFF).getTime()
const READY_AT = LAST_KICKOFF + ASSUMED_MATCH_DURATION_MS + DEFAULT_FINALISATION_BUFFER_MS

const FIXTURES = [
  { id: 51, kickoff: KICKOFF, finished: false, finishedProvisional: true },
  { id: 52, kickoff: KICKOFF, finished: false, finishedProvisional: true },
]

/** A live payload where every wanted fixture has a bonus entry for some element. */
function liveWithBonus(fixtureIds, { skip = [] } = {}) {
  const elements = {}
  fixtureIds
    .filter((id) => !skip.includes(id))
    .forEach((fixtureId, i) => {
      elements[1000 + i] = {
        explain: [[[{ stat: 'bonus', value: 2, points: 2 }], fixtureId]],
      }
    })
  return { elements }
}

describe('fixturesMissingBonus', () => {
  it('reports nothing missing once every fixture has a bonus entry for any element', () => {
    expect(fixturesMissingBonus(liveWithBonus([51, 52]), [51, 52])).toEqual([])
  })

  it('reports a fixture missing bonus even when every other fixture has it', () => {
    expect(fixturesMissingBonus(liveWithBonus([51, 52], { skip: [52] }), [51, 52])).toEqual([52])
  })

  it('counts bonus from an element nobody in the league owns — not just owned players', () => {
    // GW5's own confirmed data has exactly this: fixture 41 had no owned
    // player receive any bonus that week, yet the gameweek was finalised.
    // Element 1000 here represents such a player — present in the live
    // payload, absent from any manager's squad — and it must still count.
    const live = { elements: { 1000: { explain: [[[{ stat: 'bonus', value: 3, points: 3 }], 41]] } } }
    expect(fixturesMissingBonus(live, [41])).toEqual([])
  })
})

describe('isLocallyFinalised', () => {
  it('is not finalised while any fixture has not finished', () => {
    const fixtures = [{ id: 51, kickoff: KICKOFF, finished: false, finishedProvisional: false }]
    const result = isLocallyFinalised({ fixtures, livePayload: liveWithBonus([51]), now: READY_AT + 1_000 })
    expect(result.finalised).toBe(false)
    expect(result.reason).toMatch(/not finished/)
  })

  it('is not finalised while bonus is missing for a fixture, even once all fixtures have finished', () => {
    const result = isLocallyFinalised({
      fixtures: FIXTURES,
      livePayload: liveWithBonus([51, 52], { skip: [52] }),
      now: READY_AT + 1_000,
    })
    expect(result.finalised).toBe(false)
    expect(result.reason).toMatch(/bonus/)
  })

  it('is not finalised before the buffer has elapsed, even with fixtures finished and bonus posted', () => {
    const result = isLocallyFinalised({ fixtures: FIXTURES, livePayload: liveWithBonus([51, 52]), now: READY_AT - 1_000 })
    expect(result.finalised).toBe(false)
    expect(result.reason).toMatch(/buffer/)
  })

  it('is finalised once every fixture has finished, bonus is posted everywhere, and the buffer has elapsed', () => {
    const result = isLocallyFinalised({ fixtures: FIXTURES, livePayload: liveWithBonus([51, 52]), now: READY_AT + 1_000 })
    expect(result).toEqual({ finalised: true })
  })

  it('finalises right at the buffer boundary, not a moment early', () => {
    const atBoundary = isLocallyFinalised({ fixtures: FIXTURES, livePayload: liveWithBonus([51, 52]), now: READY_AT })
    expect(atBoundary.finalised).toBe(true)
    const justBefore = isLocallyFinalised({
      fixtures: FIXTURES,
      livePayload: liveWithBonus([51, 52]),
      now: READY_AT - 1,
    })
    expect(justBefore.finalised).toBe(false)
  })

  it('honours a configured buffer instead of the two-hour default', () => {
    const shortBuffer = 10 * 60 * 1000 // 10 minutes
    const readyAtShortBuffer = LAST_KICKOFF + ASSUMED_MATCH_DURATION_MS + shortBuffer
    const tooSoonUnderDefault = isLocallyFinalised({
      fixtures: FIXTURES,
      livePayload: liveWithBonus([51, 52]),
      now: readyAtShortBuffer + 1_000,
      bufferMs: shortBuffer,
    })
    expect(tooSoonUnderDefault.finalised).toBe(true)

    const sameMomentUnderDefaultBuffer = isLocallyFinalised({
      fixtures: FIXTURES,
      livePayload: liveWithBonus([51, 52]),
      now: readyAtShortBuffer + 1_000,
    })
    expect(sameMomentUnderDefaultBuffer.finalised).toBe(false)
  })

  it('treats finishedProvisional as finished, not just the strict finished flag', () => {
    // The strict `finished` flag lags for the same reason FPL's own
    // confirmation does — this is the whole point of the feature.
    const fixtures = [{ id: 51, kickoff: KICKOFF, finished: false, finishedProvisional: true }]
    const result = isLocallyFinalised({ fixtures, livePayload: liveWithBonus([51]), now: READY_AT + 1_000 })
    expect(result.finalised).toBe(true)
  })
})
