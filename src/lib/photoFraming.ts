/**
 * Per-player photo framing, measured by the fetch job and published in
 * photo-framing.json. See scripts/lib/framing.mjs for how and why.
 *
 * The browser only looks values up. A player with no entry, or an entry
 * that is not a sane number, gets the identity: a bad photo then renders a
 * little off rather than invisibly.
 */
export interface Framing {
  /** Multiplier that brings the head to the common size. */
  scale: number
  /** Empty frame above the hair, as a fraction of the photo's height. */
  top: number
  /**
   * The CDN's ETag for the photo the measurement was taken from. The CDN
   * replaces photos under the same URL, so the card appends this to the URL:
   * the browser then fetches the measured version rather than an older one
   * it has cached, and the lift can never be applied to the wrong picture.
   */
  etag: string | null
}

export const IDENTITY: Framing = { scale: 1, top: 0, etag: null }

let framing: Readonly<Record<string, Partial<Framing>>> = {}

export function setPhotoFraming(map: Record<string, Partial<Framing>> | undefined) {
  framing = map ?? {}
}

const sane = (n: unknown, min: number, max: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max

export function photoFraming(photoCode: number): Framing {
  const entry = framing[String(photoCode)]
  if (!entry) return IDENTITY
  const scale = sane(entry.scale, 0.5, 2) ? entry.scale! : 1
  const top = sane(entry.top, 0, 0.5) ? entry.top! : 0
  const etag = typeof entry.etag === 'string' && entry.etag.length > 0 ? entry.etag : null
  return { scale, top, etag }
}

/** A short cache key from an ETag, safe in a query string. */
export function versionOf(etag: string | null): string | null {
  if (!etag) return null
  return etag.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || null
}

/**
 * The CSS that applies a framing to a photo sitting at its natural aspect
 * at the top of the photo area, taller than the area, which clips it.
 *
 * The photo is scaled about its top centre and lifted by its headroom, so
 * the hair lands at the top edge and the figure grows down into the area.
 * Because the image really extends below the area (it is not cropped by
 * object-fit), a lift pulls real pixels up and leaves no gap above the
 * name band. Scales below 1 are never published, and are ignored here.
 */
export function framingStyle({ scale, top }: Framing): React.CSSProperties | undefined {
  const s = Math.max(1, scale)
  if (s === 1 && top === 0) return undefined
  const lift = top * s * 100
  return { transform: `translateY(-${lift.toFixed(2)}%) scale(${s})`, transformOrigin: '50% 0%' }
}
