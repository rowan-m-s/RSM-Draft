import { afterEach, describe, expect, it, vi } from 'vitest'
import { findMissingPhotos, formatMissingReport } from './photos.mjs'

/**
 * The photo report's three lists, driven by a fake CDN: the set of URLs
 * that resolve is declared per test and `fetch` is stubbed to match.
 */
const owned = [
  { name: 'Manzambi', photoCode: 614071, clubShort: 'AVL', owner: 'rushy' },
  { name: 'Haaland', photoCode: 223094, clubShort: 'MCI', owner: 'dj' },
  { name: 'Rogers', photoCode: 244850, clubShort: 'CHE', owner: 'rushy' },
  { name: 'Emersonn', photoCode: 999001, clubShort: 'IPS', owner: 'wood' },
]
const current = (code) => `https://cdn/current/${code}.png`
const legacy = (code) => `https://cdn/legacy/p${code}.png`

function stubCdn(live) {
  vi.stubGlobal('fetch', async (url) => ({
    ok: live.has(url),
    status: live.has(url) ? 200 : 403,
    arrayBuffer: async () => new ArrayBuffer(live.has(url) ? 16 : 0),
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('findMissingPhotos', () => {
  it('sorts owned players into no image, legacy only, and redundant overrides', async () => {
    stubCdn(new Set([current(223094), legacy(244850), current(614071)]))
    const result = await findMissingPhotos({
      owned,
      overrides: new Set([614071]),
      userAgent: 'test',
      photoUrl: current,
      legacyPhotoUrl: legacy,
    })
    expect(result.noImage.map((p) => p.name)).toEqual(['Emersonn'])
    expect(result.legacyOnly.map((p) => p.name)).toEqual(['Rogers'])
    // Manzambi has an override AND the CDN now resolves: the file should go.
    expect(result.redundantOverrides.map((p) => p.name)).toEqual(['Manzambi'])
  })

  it('keeps an override quiet while the CDN still has nothing', async () => {
    stubCdn(new Set([current(223094)]))
    const result = await findMissingPhotos({
      owned,
      overrides: new Set([614071]),
      userAgent: 'test',
      photoUrl: current,
      legacyPhotoUrl: legacy,
    })
    expect(result.redundantOverrides).toEqual([])
    // And an overridden player is never reported as missing.
    expect(result.noImage.map((p) => p.name)).not.toContain('Manzambi')
  })
})

describe('formatMissingReport', () => {
  const nameOf = (k) => k.toUpperCase()
  it('leads with the overrides to delete, naming the file', () => {
    const text = formatMissingReport({ noImage: [], legacyOnly: [], redundantOverrides: [owned[0]] }, nameOf)
    expect(text).toContain('1 override(s) are no longer needed')
    expect(text).toContain('public/images/players/614071.png')
    expect(text).toContain('RUSHY')
  })
  it('says so when there is nothing to do', () => {
    expect(formatMissingReport({ noImage: [], legacyOnly: [] }, nameOf)).toBe('Every owned player has a current photo.')
  })
})
