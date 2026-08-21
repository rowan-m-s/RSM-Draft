import { describe, expect, it } from 'vitest'
import { clubBadge, playerPhoto, playerPhotoCandidates, playerPhotoSources, setPlayerImageOverrides } from './assets'

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

describe('the image resolution chain', () => {
  const PALESTRA = 620109
  const HAALAND = 223094

  it('is current CDN then legacy CDN when there is no override', () => {
    setPlayerImageOverrides([])
    const [first, second, ...rest] = playerPhotoSources(HAALAND)
    expect(first).toContain('premierleague25/photos/players/110x140/223094.png')
    expect(second).toContain('premierleague/photos/players/110x140/p223094.png')
    expect(rest).toEqual([])
  })

  it('puts a local override in front of both', () => {
    setPlayerImageOverrides([PALESTRA])
    const sources = playerPhotoSources(PALESTRA)
    expect(sources).toHaveLength(3)
    expect(sources[0]).toContain(`images/players/${PALESTRA}.png`)
    expect(sources[1]).toContain('premierleague25')
    expect(sources[2]).toContain('/p' + PALESTRA)
  })

  it('overrides only the player it names', () => {
    setPlayerImageOverrides([PALESTRA])
    expect(playerPhotoSources(HAALAND)[0]).toContain('resources.premierleague.com')
  })

  it('is keyed on code, so it survives an id reshuffle between seasons', () => {
    // The override list holds element codes. Nothing here ever sees an id.
    setPlayerImageOverrides([PALESTRA])
    expect(playerPhotoSources(PALESTRA)[0]).toContain(String(PALESTRA))
    setPlayerImageOverrides([])
  })

  it('uses 250x250 for the legacy large size, which has no 500x500', () => {
    setPlayerImageOverrides([])
    expect(playerPhotoSources(HAALAND, 'large')[0]).toContain('/500x500/')
    expect(playerPhotoSources(HAALAND, 'large')[1]).toContain('/250x250/')
  })
})

describe('responsive card photos', () => {
  const HAALAND = 223094
  const PALESTRA = 620109
  it('offers the 220 and 500 pixel CDN files, and the override alone', () => {
    setPlayerImageOverrides([])
    const [current, legacy] = playerPhotoCandidates(HAALAND)
    expect(current.srcSet).toBe(`${playerPhoto(HAALAND, 'small')} 220w, ${playerPhoto(HAALAND, 'large')} 500w`)
    expect(legacy.srcSet).toContain('/250x250/p')
    expect(legacy.srcSet).toContain(' 500w')

    setPlayerImageOverrides([PALESTRA])
    const [override] = playerPhotoCandidates(PALESTRA)
    expect(override.src).toContain(`images/players/${PALESTRA}.png`)
    expect(override.srcSet).toBeUndefined()
    setPlayerImageOverrides([])
  })
})
