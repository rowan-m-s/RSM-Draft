import { describe, expect, it } from 'vitest'
import { framingStyle, photoFraming, setPhotoFraming, versionOf } from './photoFraming'

describe('photoFraming', () => {
  it('returns the identity for unknown players and for nonsense values', () => {
    setPhotoFraming({ 7: { scale: 1.2, top: 0.1, etag: '"abc"' }, 8: { scale: 0, top: 0.1 }, 9: { scale: NaN }, 10: { top: 2 } })
    expect(photoFraming(1)).toEqual({ scale: 1, top: 0, etag: null })
    expect(photoFraming(7)).toEqual({ scale: 1.2, top: 0.1, etag: '"abc"' })
    // A zero or NaN scale would make the photo vanish: fall back to 1.
    expect(photoFraming(8).scale).toBe(1)
    expect(photoFraming(9).scale).toBe(1)
    expect(photoFraming(10)).toEqual({ scale: 1, top: 0, etag: null })
    setPhotoFraming(undefined)
    expect(photoFraming(7)).toEqual({ scale: 1, top: 0, etag: null })
  })

  it('turns an ETag into a short query-safe version, or nothing', () => {
    expect(versionOf('"2dbcb424076123cacaea86a6074ed49c"')).toBe('2dbcb4240761')
    expect(versionOf(null)).toBeNull()
    expect(versionOf('""')).toBeNull()
  })

  it('writes no style for the identity, lifts by the headroom when enlarging, anchors low when shrinking', () => {
    expect(framingStyle({ scale: 1, top: 0, etag: null })).toBeUndefined()
    expect(framingStyle({ scale: 1.2, top: 0.1, etag: null })).toEqual({
      transform: 'translateY(-12.00%) scale(1.2)',
      transformOrigin: '50% 0%',
    })
    expect(framingStyle({ scale: 0.9, top: 0, etag: null })).toEqual({ transform: 'scale(0.9)', transformOrigin: '50% 100%' })
  })
})
