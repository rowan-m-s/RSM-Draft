import { useEffect, useState } from 'react'
import type { PhotoSize } from '../lib/assets'
import { IDENTITY, framingStyle, versionOf, type Framing } from '../lib/photoFraming'
import {
  BADGE_FALLBACK,
  PLAYER_FALLBACK,
  clubBadge,
  managerIcon2x,
  managerImage,
  playerGraphic,
  playerPhotoCandidates,
  playerPhotoSources,
} from '../lib/assets'

interface ImgProps {
  webp?: string
  /** Tried in order. The first that loads wins. */
  sources: string[]
  /** Optional responsive candidates per source, parallel to `sources`. */
  srcSets?: (string | undefined)[]
  /** The rendered CSS width, for the browser to choose from `srcSets`. */
  sizes?: string
  fallback: string
  alt: string
  className?: string
  width?: number
  height?: number
  loading?: 'lazy' | 'eager'
  style?: React.CSSProperties
}

/**
 * An image that always renders something.
 *
 * Every player image needs this: new signings routinely have no photo for
 * weeks, and a broken-image icon in every third row looks awful. Player photos
 * walk a chain of up to three sources before the fallback, so a missing one
 * steps down rather than giving up. Manager images are asserted at build time
 * so they should never fall back, but the cost of the guard is nil.
 */
export function Img({
  webp,
  sources,
  srcSets,
  sizes,
  fallback,
  alt,
  className,
  width,
  height,
  loading = 'lazy',
  style,
}: ImgProps) {
  const [index, setIndex] = useState(0)

  // A different set of sources is a different image, so start again at the top.
  const key = sources.join('|')
  useEffect(() => setIndex(0), [key])

  const src = sources[index]
  if (!src) {
    return <img src={fallback} alt={alt} className={className} width={width} height={height} style={style} />
  }

  return (
    <picture key={key}>
      {/* The webp variant only ever accompanies the first source. */}
      {webp && index === 0 && <source srcSet={webp} type="image/webp" />}
      <img
        src={src}
        srcSet={srcSets?.[index]}
        sizes={srcSets?.[index] ? sizes : undefined}
        alt={alt}
        className={className}
        width={width}
        height={height}
        loading={loading}
        style={style}
        onError={() => setIndex((current) => current + 1)}
      />
    </picture>
  )
}

/* A data URI cannot read CSS variables, so the placeholder is white at the
   same alphas as --color-pl-border and --color-pl-muted: it reads as a ghost
   of a face on whichever aubergine surface it lands on. */
const AVATAR_FALLBACK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="white"><rect width="64" height="64" fill-opacity=".1"/><circle cx="32" cy="25" r="11" fill-opacity=".35"/><path d="M10 64c0-12 10-20 22-20s22 8 22 20z" fill-opacity=".35"/></svg>`
  )

/**
 * The circular face icon. Used everywhere a manager's name appears, so it has
 * to stay legible at 28px — the source images are cropped to the face by the
 * optimise script for exactly that reason.
 */
export function ManagerAvatar({
  managerKey,
  size = 28,
  className = '',
}: {
  managerKey: string
  size?: number
  className?: string
}) {
  const large = size > 48
  return (
    <Img
      webp={large ? managerIcon2x(managerKey, 'webp') : managerImage('icon', managerKey, 'webp')}
      sources={[large ? managerIcon2x(managerKey, 'jpg') : managerImage('icon', managerKey, 'jpg')]}
      fallback={AVATAR_FALLBACK}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-pl-surface-2 object-cover ring-1 ring-pl-border ${className}`}
    />
  )
}

export function PlayerPhoto({
  photoCode,
  name,
  size = 'small',
  className = '',
}: {
  photoCode: number
  name: string
  size?: PhotoSize
  className?: string
}) {
  return (
    <Img
      sources={playerPhotoSources(photoCode, size)}
      fallback={PLAYER_FALLBACK}
      alt={name}
      className={className}
    />
  )
}

/**
 * The photo inside a player card. Responsive: the browser is told the CSS
 * width the card draws it at and picks between the CDN's 220 and 500 pixel
 * files by device pixel ratio. Explicit width and height (the photo's own
 * 11:14) so nothing shifts while it loads; the photo area clips the bottom.
 */
export function CardPhoto({
  photoCode,
  name,
  width,
  height,
  framing = IDENTITY,
  className = '',
}: {
  photoCode: number
  name: string
  width: number
  height: number
  /** Per-player framing, measured by the pipeline; see lib/photoFraming.ts. */
  framing?: Framing
  className?: string
}) {
  const candidates = playerPhotoCandidates(photoCode, versionOf(framing.etag))
  return (
    <Img
      sources={candidates.map((c) => c.src)}
      srcSets={candidates.map((c) => c.srcSet)}
      sizes={`${width}px`}
      fallback={PLAYER_FALLBACK}
      alt={name}
      width={width}
      height={height}
      className={className}
      style={framingStyle(framing)}
    />
  )
}

export function ClubBadge({ clubCode, club, size = 20 }: { clubCode: number; club: string; size?: number }) {
  return (
    <Img
      sources={[clubBadge(clubCode, 50)]}
      fallback={BADGE_FALLBACK}
      alt={club}
      width={size}
      height={size}
      className="shrink-0"
    />
  )
}

/**
 * The fixed frame that Koch, MOTM and winner cards sit inside.
 *
 * The cards are photographs at whatever aspect ratio they were made in. A
 * square crop decapitates people, so the image is fitted inside the frame and
 * letterboxed against the frame's own background instead.
 */
export function CardImage({
  set,
  managerKey,
  playerCode,
  alt,
  className = '',
}: {
  set: 'koch' | 'koch2' | 'motm' | 'leader' | 'winner'
  managerKey: string
  /** For player-keyed sets (leader): which of the manager's graphics. */
  playerCode?: number | null
  alt: string
  className?: string
}) {
  const webp =
    set === 'leader' && playerCode != null
      ? playerGraphic(set, managerKey, playerCode, 'webp')
      : set === 'leader'
        ? null
        : managerImage(set, managerKey, 'webp')
  const jpg =
    set === 'leader' && playerCode != null
      ? playerGraphic(set, managerKey, playerCode, 'jpg')
      : set === 'leader'
        ? null
        : managerImage(set, managerKey, 'jpg')
  return (
    <div className={`overflow-hidden rounded-md bg-pl-bg ${className}`}>
      <Img
        webp={webp ?? undefined}
        sources={jpg ? [jpg] : []}
        fallback={AVATAR_FALLBACK}
        alt={alt}
        className="h-full w-full object-contain"
      />
    </div>
  )
}
