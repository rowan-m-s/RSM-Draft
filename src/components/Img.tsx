import { useEffect, useState } from 'react'
import type { PhotoSize } from '../lib/assets'
import {
  BADGE_FALLBACK,
  PLAYER_FALLBACK,
  clubBadge,
  managerIcon2x,
  managerImage,
  playerPhotoSrc,
} from '../lib/assets'

interface ImgProps {
  webp?: string
  src: string
  fallback: string
  alt: string
  className?: string
  width?: number
  height?: number
  loading?: 'lazy' | 'eager'
}

/**
 * An image that always renders something.
 *
 * Every player image needs this: new signings routinely have no photo for
 * weeks, and a broken-image icon in every third row looks awful. Manager
 * images are asserted at build time so they should never fall back, but the
 * cost of the guard is nil.
 */
export function Img({ webp, src, fallback, alt, className, width, height, loading = 'lazy' }: ImgProps) {
  const [failed, setFailed] = useState(false)

  // A changed src is a different image, so give it its own chance to load.
  useEffect(() => setFailed(false), [src])

  if (failed) {
    return <img src={fallback} alt={alt} className={className} width={width} height={height} />
  }

  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        className={className}
        width={width}
        height={height}
        loading={loading}
        onError={() => setFailed(true)}
      />
    </picture>
  )
}

const AVATAR_FALLBACK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#E5E5EB"/><circle cx="32" cy="25" r="11" fill="#B9B9C6"/><path d="M10 64c0-12 10-20 22-20s22 8 22 20z" fill="#B9B9C6"/></svg>`
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
      src={large ? managerIcon2x(managerKey, 'jpg') : managerImage('icon', managerKey, 'jpg')}
      fallback={AVATAR_FALLBACK}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-pl-white object-cover ring-1 ring-pl-border ${className}`}
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
      src={playerPhotoSrc(photoCode, size)}
      fallback={PLAYER_FALLBACK}
      alt={name}
      className={className}
    />
  )
}

export function ClubBadge({ clubCode, club, size = 20 }: { clubCode: number; club: string; size?: number }) {
  return (
    <Img
      src={clubBadge(clubCode, 50)}
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
  alt,
  className = '',
}: {
  set: 'koch' | 'motm' | 'winner'
  managerKey: string
  alt: string
  className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-md bg-pl-navy ${className}`}>
      <Img
        webp={managerImage(set, managerKey, 'webp')}
        src={managerImage(set, managerKey, 'jpg')}
        fallback={AVATAR_FALLBACK}
        alt={alt}
        className="h-full w-full object-contain"
      />
    </div>
  )
}
