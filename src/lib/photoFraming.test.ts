import { describe, expect, it } from 'vitest'
import { framingStyle, photoFraming, setPhotoFraming } from './photoFraming'

describe('photoFraming', () => {
  it('returns the identity for unknown players and for nonsense values', () => {
    setPhotoFraming({ 7: { scale: 1.2, top: 0.1 }, 8: { scale: 0, top: 0.1 }, 9: { scale: NaN }, 10: { top: 2 } })
    expect(photoFraming(1)).toEqual({ scale: 1, top: 0 })
    expect(photoFraming(7)).toEqual({ scale: 1.2, top: 0.1 })
    // A zero or NaN scale would make the photo vanish: fall back to 1.
    expect(photoFraming(8).scale).toBe(1)
    expect(photoFraming(9).scale).toBe(1)
    expect(photoFraming(10)).toEqual({ scale: 1, top: 0 })
    setPhotoFraming(undefined)
    expect(photoFraming(7)).toEqual({ scale: 1, top: 0 })
  })

  it('writes no style for the identity, lifts by the headroom when enlarging, anchors low when shrinking', () => {
    expect(framingStyle({ scale: 1, top: 0 })).toBeUndefined()
    expect(framingStyle({ scale: 1.2, top: 0.1 })).toEqual({
      transform: 'translateY(-12.00%) scale(1.2)',
      transformOrigin: '50% 0%',
    })
    expect(framingStyle({ scale: 0.9, top: 0 })).toEqual({ transform: 'scale(0.9)', transformOrigin: '50% 100%' })
  })
})
