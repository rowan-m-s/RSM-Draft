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
 * The correction only ever enlarges. Head width is measured across the
 * hair, so a player with a lot of it reads as a big head and would be shrunk
 * for no reason (Calvert-Lewin, Doku, O'Reilly); a genuinely tight photo is
 * within a few percent of the norm anyway. Wide photos, where the head
 * really is small, are brought in. The scale is capped at 1.3: more than
 * that is probably a mis-detection (a ball, a raised arm). Anything the
 * measurement cannot handle is simply not recorded, and the card falls
 * back to a scale of 1, so a bad photo renders slightly off rather than
 * invisibly.
 */

/** Head width as a fraction of frame width that the cards are normalised to. */
export const TARGET_HEAD_WIDTH = 0.33
export const SCALE_MIN = 1
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
 * The CDN replaces photos under the same URL (a reshoot, a new kit), so a
 * measurement is only valid for the bytes it was taken from. Each entry
 * carries the CDN's ETag: a code already in `existing` is revalidated with
 * a conditional request, which answers 304 and costs nothing when the photo
 * is unchanged, and is re-measured only when it has. New codes are fetched
 * and measured. The ETag is also published so the browser can pin the same
 * version of the file.
 *
 * `fetchPhoto(code, etag)` returns { unchanged: true }, { buffer, etag }, or
 * null when there is no photo. A failed fetch or measurement is logged and
 * the code left out (or its stale entry dropped), to be retried next run;
 * the browser treats a missing entry as scale 1.
 */
export async function updateFraming({ codes, existing = {}, fetchPhoto, log = () => {}, concurrency = 8 }) {
  const framing = {}
  const wanted = [...new Set(codes)]
  const stats = { unchanged: 0, measured: 0, failed: 0 }

  let index = 0
  async function worker() {
    while (index < wanted.length) {
      const code = wanted[index++]
      const previous = existing[code]
      try {
        const result = await fetchPhoto(code, previous?.etag)
        if (!result) {
          stats.failed += 1
          continue
        }
        if (result.unchanged && previous) {
          framing[code] = previous
          stats.unchanged += 1
          continue
        }
        const measured = await measureFraming(result.buffer)
        framing[code] = { ...measured, etag: result.etag ?? null }
        stats.measured += 1
      } catch (error) {
        stats.failed += 1
        log(`  framing: could not measure ${code} (${error.message})`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, wanted.length) }, worker))
  return { framing, stats }
}
