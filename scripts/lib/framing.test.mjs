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
  it('measures only codes it has not seen, and leaves failures out', async () => {
    const normal = await cutout({ headWidth: TARGET_HEAD_WIDTH, headroom: 0 })
    const fetched = []
    const fetchPhoto = async (code) => {
      fetched.push(code)
      if (code === 3) return null // 403 from the CDN
      if (code === 4) return Buffer.from('not a png')
      return normal
    }
    const existing = { 1: { scale: 1.1, top: 0.05 } }
    const { framing, stats } = await updateFraming({ codes: [1, 2, 3, 4, 2], existing, fetchPhoto })
    expect(fetched.sort()).toEqual([2, 3, 4]) // 1 was cached, 2 once despite the duplicate
    expect(framing[1]).toEqual({ scale: 1.1, top: 0.05 })
    expect(framing[2].scale).toBeCloseTo(1, 1)
    expect(framing[3]).toBeUndefined()
    expect(framing[4]).toBeUndefined()
    expect(stats).toEqual({ cached: 1, measured: 1, failed: 2 })
  })
})
