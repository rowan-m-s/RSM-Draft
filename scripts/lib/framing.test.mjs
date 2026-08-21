import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { SCALE_MAX, SCALE_MIN, TARGET_HEAD_WIDTH, measureFraming, updateFraming } from './framing.mjs'

/**
 * Synthetic cut-outs: a transparent 220×280 frame with a "head" (a filled
 * circle of a chosen width, at a chosen headroom) on "shoulders" (a block
 * that runs to the bottom edge, as the CDN crops do).
 */
async function cutout({ headWidth, headroom, W = 220, H = 280 }) {
  const r = Math.round((headWidth * W) / 2)
  const cy = Math.round(headroom * H) + r
  const neck = Math.round(H * 0.08)
  const shouldersTop = cy + r + neck
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <circle cx="${W / 2}" cy="${cy}" r="${r}" fill="black"/>
    <rect x="${W / 2 - r * 0.3}" y="${cy}" width="${r * 0.6}" height="${neck + r}" fill="black"/>
    <rect x="${W * 0.1}" y="${shouldersTop}" width="${W * 0.8}" height="${H - shouldersTop}" fill="black"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

describe('measureFraming', () => {
  it('finds the headroom and scales a normal head to 1', async () => {
    const { scale, top } = await measureFraming(await cutout({ headWidth: TARGET_HEAD_WIDTH, headroom: 0 }))
    expect(top).toBe(0)
    expect(scale).toBeCloseTo(1, 1)
  })

  it('scales a wide-framed photo up and records its headroom', async () => {
    const { scale, top } = await measureFraming(await cutout({ headWidth: 0.27, headroom: 0.12 }))
    expect(top).toBeCloseTo(0.12, 2)
    expect(scale).toBeCloseTo(TARGET_HEAD_WIDTH / 0.27, 1)
  })

  it('scales a tight photo down, within the clamp', async () => {
    const { scale } = await measureFraming(await cutout({ headWidth: 0.5, headroom: 0 }))
    expect(scale).toBe(SCALE_MIN)
    const wide = await measureFraming(await cutout({ headWidth: 0.2, headroom: 0 }))
    expect(wide.scale).toBe(SCALE_MAX)
  })

  it('refuses an empty image rather than inventing a value', async () => {
    const empty = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()
    await expect(measureFraming(empty)).rejects.toThrow('no opaque pixels')
  })
})

describe('updateFraming', () => {
  it('revalidates cached codes, re-measures changed photos, and leaves failures out', async () => {
    const normal = await cutout({ headWidth: TARGET_HEAD_WIDTH, headroom: 0 })
    const wide = await cutout({ headWidth: 0.27, headroom: 0.12 })
    const calls = []
    const fetchPhoto = async (code, etag) => {
      calls.push([code, etag])
      if (code === 1) return { unchanged: true } // 304: the cached entry stands
      if (code === 2) return { buffer: wide, etag: '"new"' } // the CDN replaced the photo
      if (code === 3) return null // 403 from the CDN
      if (code === 4) return { buffer: Buffer.from('not a png'), etag: '"x"' }
      return { buffer: normal, etag: '"n"' }
    }
    const existing = {
      1: { scale: 1.1, top: 0.05, etag: '"a"' },
      2: { scale: 1, top: 0, etag: '"old"' },
    }
    const { framing, stats } = await updateFraming({ codes: [1, 2, 3, 4, 5, 5], existing, fetchPhoto })
    // Cached codes are asked about conditionally, with their ETag; each code once.
    expect(calls.sort()).toEqual([[1, '"a"'], [2, '"old"'], [3, undefined], [4, undefined], [5, undefined]])
    expect(framing[1]).toEqual({ scale: 1.1, top: 0.05, etag: '"a"' })
    expect(framing[2].top).toBeCloseTo(0.12, 2)
    expect(framing[2].etag).toBe('"new"')
    expect(framing[3]).toBeUndefined()
    expect(framing[4]).toBeUndefined()
    expect(framing[5].scale).toBeCloseTo(1, 1)
    expect(stats).toEqual({ unchanged: 1, measured: 2, failed: 2 })
  })

  it('drops a stale entry whose photo has gone rather than keeping a lift for a picture that is not there', async () => {
    const { framing } = await updateFraming({
      codes: [9],
      existing: { 9: { scale: 1.2, top: 0.1, etag: '"gone"' } },
      fetchPhoto: async () => null,
    })
    expect(framing[9]).toBeUndefined()
  })
})
