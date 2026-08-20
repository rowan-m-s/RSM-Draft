import { describe, expect, it } from 'vitest'
import { clubBadge, playerPhoto, playerPhotoSrc, setPlayerImageOverrides } from './assets'

/**
 * These pin the resolved pattern rather than testing logic.
 *
 * The failure this guards against is silent: an out-of-date photo path keeps
 * returning 200 and simply serves last season's picture, so a player who
 * transferred shows up in his old kit and nothing ever errors. Nobody notices
 * for weeks. If someone edits the path back, this fails immediately and the
 * comment in assets.ts explains what to re-verify.
 *
 * Pattern verified by eye 20 August 2026 — see scripts/probe-photos.mjs.
 */
describe('player photo URL', () => {
  const HAALAND = 223094

  it('uses the season-scoped path with no `p` prefix', () => {
    expect(playerPhoto(HAALAND)).toBe(
      'https://resources.premierleague.com/premierleague25/photos/players/110x140/223094.png'
    )
  })

  it('never emits the old unversioned path, which serves last season’s kits', () => {
    for (const size of ['tiny', 'small', 'large'] as const) {
      const url = playerPhoto(HAALAND, size)
      expect(url).not.toMatch(/premierleague\/photos/)
      // The `p` prefix belongs to the old path; the current one 403s with it.
      expect(url).not.toMatch(/\/p\d+\.png$/)
    }
  })

  it('offers only sizes that exist on the current path', () => {
    // 250x250 was an old-path size and 403s on this one.
    expect(playerPhoto(HAALAND, 'tiny')).toContain('/40x40/')
    expect(playerPhoto(HAALAND, 'small')).toContain('/110x140/')
    expect(playerPhoto(HAALAND, 'large')).toContain('/500x500/')
  })
})

describe('club badge URL', () => {
  it('uses the unversioned path — badges are not season-scoped', () => {
    // premierleague25/badges/* returns 403 for every size.
    expect(clubBadge(2)).toBe('https://resources.premierleague.com/premierleague/badges/50/t2.png')
  })
})

describe('local image overrides', () => {
  const PALESTRA = 620109

  it('falls through to the CDN when there is no override', () => {
    setPlayerImageOverrides([])
    expect(playerPhotoSrc(PALESTRA)).toContain('resources.premierleague.com')
  })

  it('prefers a local file when one exists', () => {
    setPlayerImageOverrides([PALESTRA])
    expect(playerPhotoSrc(PALESTRA)).toContain(`images/players/${PALESTRA}.png`)
    expect(playerPhotoSrc(PALESTRA)).not.toContain('resources.premierleague.com')
  })

  it('overrides only the player it names', () => {
    setPlayerImageOverrides([PALESTRA])
    expect(playerPhotoSrc(223094)).toContain('resources.premierleague.com')
  })

  it('is keyed on code, so it survives an id reshuffle between seasons', () => {
    // The override list holds element codes. Nothing here ever sees an id.
    setPlayerImageOverrides([PALESTRA])
    expect(playerPhotoSrc(PALESTRA)).toContain(String(PALESTRA))
    setPlayerImageOverrides([])
  })
})
