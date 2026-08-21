import sharp from 'sharp'

/**
 * Per-player photo framing, measured once and cached by player code.
 *
 * The CDN serves every player at the same pixel size, but clubs shoot their
 * own headshots and the crop varies per player, not per club: measured
 * across the league, the spread of head size within a club is larger than
 * the spread between clubs. So each photo is measured from its alpha
 * channel and given a scale that brings its head to a common size on the
 * card, plus the headroom above the hair so the head can be anchored to the
 * top.
 *
 * `scale` is clamped: a photo that would need more than 1.3× is probably
 * mis-detected (a ball, a raised arm), and below 0.85 the shoulders would
 * lift off the name band. Anything the measurement cannot handle is simply
 * not recorded, and the card falls back to a scale of 1, so a bad photo
 * renders slightly off rather than invisibly.
 */

/** Head width as a fraction of frame width that the cards are normalised to. */
export const TARGET_HEAD_WIDTH = 0.33
export const SCALE_MIN = 0.85
export const SCALE_MAX = 1.3
const ALPHA_THRESHOLD = 40

/** Measure one photo. Throws if there is nothing opaque in it. */
export async function measureFraming(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels } = info
  const alpha = (x, y) => data[(y * W + x) * channels + 3]

  let top = -1
  let bottom = -1
  for (let y = 0; y < H; y++) {
    let any = false
    for (let x = 0; x < W; x++) {
      if (alpha(x, y) > ALPHA_THRESHOLD) {
        any = true
        break
      }
    }
    if (any) {
      if (top < 0) top = y
      bottom = y
    }
  }
  if (top < 0) throw new Error('no opaque pixels')

  // Head width: the widest opaque run in the top fifth of the figure, which
  // spans the hair and ears and sits above the shoulders on every photo.
  const figureHeight = bottom - top + 1
  const y0 = top + Math.floor(figureHeight * 0.05)
  const y1 = top + Math.floor(figureHeight * 0.22)
  let headWidth = 0
  for (let y = y0; y < Math.max(y0 + 1, y1); y++) {
    let first = -1
    let last = -1
    for (let x = 0; x < W; x++) {
      if (alpha(x, y) > ALPHA_THRESHOLD) {
        if (first < 0) first = x
        last = x
      }
    }
    if (first >= 0) headWidth = Math.max(headWidth, (last - first + 1) / W)
  }
  if (headWidth === 0) throw new Error('no head found')

  const scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, TARGET_HEAD_WIDTH / headWidth))
  return { scale: round3(scale), top: round3(top / H) }
}

const round3 = (n) => Math.round(n * 1000) / 1000

/**
 * Bring the framing map up to date for a set of player codes.
 *
 * Only codes not already in `existing` are fetched and measured, so a run
 * with no new players costs nothing. `fetchPhoto(code)` returns a PNG buffer
 * or null. A failed fetch or measurement is logged and left out, to be
 * retried next run; the browser treats a missing entry as scale 1.
 */
export async function updateFraming({ codes, existing = {}, fetchPhoto, log = () => {}, concurrency = 8 }) {
  const framing = { ...existing }
  const pending = [...new Set(codes)].filter((code) => !(code in framing))
  const stats = { cached: Object.keys(existing).length, measured: 0, failed: 0 }

  let index = 0
  async function worker() {
    while (index < pending.length) {
      const code = pending[index++]
      try {
        const buffer = await fetchPhoto(code)
        if (!buffer) {
          stats.failed += 1
          continue
        }
        framing[code] = await measureFraming(buffer)
        stats.measured += 1
      } catch (error) {
        stats.failed += 1
        log(`  framing: could not measure ${code} (${error.message})`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
  return { framing, stats }
}
