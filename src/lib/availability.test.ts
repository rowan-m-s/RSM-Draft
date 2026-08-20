import { describe, expect, it } from 'vitest'
import { availabilityText, flagColour, flagLabel } from './availability'

/**
 * Status codes checked against the live Draft bootstrap on 20 August 2026 —
 * Draft was not assumed to match the classic game.
 */
describe('flagColour', () => {
  it('is yellow only for doubtful', () => {
    expect(flagColour('d')).toBe('yellow')
  })

  it('is red for injured, suspended and unavailable', () => {
    expect(flagColour('i')).toBe('red')
    expect(flagColour('s')).toBe('red')
    expect(flagColour('u')).toBe('red')
  })

  it('shows nothing for an available player or an unknown code', () => {
    expect(flagColour('a')).toBe('none')
    expect(flagColour(undefined)).toBe('none')
    expect(flagColour('z')).toBe('none')
  })
})

describe('flagLabel', () => {
  it('names each status', () => {
    expect(flagLabel('d')).toBe('Doubtful')
    expect(flagLabel('i')).toBe('Injured')
    expect(flagLabel('s')).toBe('Suspended')
    expect(flagLabel('u')).toBe('Unavailable')
    expect(flagLabel('a')).toBeNull()
  })
})

describe('availabilityText', () => {
  const player = (over: Partial<Parameters<typeof availabilityText>[0]>) =>
    ({ status: 'a', chanceOfPlaying: null, news: null, newsAdded: null, ...over })

  it('says nothing for an available player', () => {
    expect(availabilityText(player({ status: 'a' }))).toBeNull()
  })

  it('uses FPL’s own wording when it already carries the percentage', () => {
    const text = availabilityText(
      player({ status: 'd', chanceOfPlaying: 75, news: 'Calf injury - 75% chance of playing' })
    )
    // Not "…75% chance of playing — 75% chance of playing".
    expect(text).toBe('Calf injury - 75% chance of playing')
  })

  it('adds the percentage when the news omits it and it says something', () => {
    expect(availabilityText(player({ status: 'd', chanceOfPlaying: 50, news: 'Knock' }))).toBe(
      'Knock — 50% chance of playing'
    )
  })

  it('does not append a pointless 0% to a ruled-out player', () => {
    // The heading already says Injured; "0% chance of playing" adds nothing.
    expect(
      availabilityText(player({ status: 'i', chanceOfPlaying: 0, news: 'Groin injury - Unknown return date' }))
    ).toBe('Groin injury - Unknown return date')
  })

  it('falls back to the label when there is no news at all', () => {
    expect(availabilityText(player({ status: 's', chanceOfPlaying: 0, news: null }))).toBe('Suspended')
  })
})
