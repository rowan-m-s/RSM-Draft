import { CardPhoto } from './Img'
import { PlayerFlag } from './PlayerFlag'
import type { Availability } from '../lib/availability'
import { photoFraming } from '../lib/photoFraming'
import type { Position } from '../types'

/**
 * A player on the pitch. Addendum 03, A1.
 *
 * A portrait card rather than a circle: the photos are head-and-shoulders
 * cut outs, and a circular mask crops the shoulders and leaves a head
 * floating. Here the cut out sits at its natural 11:14 aspect, filling the
 * photo area's width from the top; the area is shorter than the image and
 * clips it, so the figure runs into the name band at the chest, where the
 * Premier League's own photos are cropped. Per-player framing (see
 * lib/photoFraming.ts) then enlarges the wide shots to a common head size.
 *
 * Anatomy, top to bottom: photo area on a vertical surface gradient, lighter
 * at the top; a solid aubergine name band; a lifted info band carrying the
 * points, fixture or draft pick. Depth comes from value contrast — the
 * gradient and a one pixel light edge along the top — not from a shadow,
 * which would vanish on a dark ground.
 *
 * Two sizes, two components. The compact card is five-across at 375px, about
 * 68px wide, and at that size it is photo, surname and one number: nothing
 * else fits. It is built as its own markup rather than the full card scaled
 * down until it breaks.
 */

export interface CardPlayer extends Availability {
  name: string
  position: Position
  photoCode: number
}

interface PlayerCardProps {
  player: CardPlayer
  /** The one line in the info band: points, fixture or pick. */
  line: string
  /** Bench cards are a touch smaller and quieter so the XI reads first. */
  bench?: boolean
  /** Automatic substitution marker, when the week has one. */
  sub?: 'on' | 'off' | null
}

function SubMarker({ sub }: { sub: 'on' | 'off' }) {
  return sub === 'on' ? (
    <span
      title="Came on as an automatic substitute"
      className="absolute bottom-1 left-1 rounded-sm bg-pl-green px-1 text-[9px] leading-4 font-bold text-pl-bg"
    >
      ▲
    </span>
  ) : (
    <span
      title="Replaced by an automatic substitute"
      className="absolute bottom-1 left-1 rounded-sm bg-pl-surface-2 px-1 text-[9px] leading-4 font-bold text-pl-text"
    >
      ▼
    </span>
  )
}

export function PlayerCard({ player, line, bench = false, sub = null }: PlayerCardProps) {
  return (
    <div
      className={[
        'player-card relative flex flex-col overflow-hidden rounded-md',
        bench ? 'w-[88px] opacity-90 saturate-[.85]' : 'w-[104px]',
      ].join(' ')}
    >
      <div className={`player-card-photo relative overflow-hidden ${bench ? 'h-[82px]' : 'h-[98px]'}`}>
        <CardPhoto
          photoCode={player.photoCode}
          name={player.name}
          width={bench ? 88 : 104}
          height={bench ? 112 : 132}
          framing={photoFraming(player.photoCode)}
          className="absolute inset-x-0 top-0 h-auto w-full"
        />
        <PlayerFlag player={player} size={14} className="absolute top-0 right-0" />
        {sub && <SubMarker sub={sub} />}
      </div>
      <p className="truncate bg-pl-bg px-1.5 text-center text-xs leading-5 font-semibold text-pl-text" title={player.name}>
        {player.name}
      </p>
      <p className="tnum truncate bg-pl-surface-2 px-1.5 text-center text-[11px] leading-5 text-pl-text" title={line}>
        {line}
      </p>
    </div>
  )
}

/** The 375px card: photo, surname, one number. */
export function PlayerCardCompact({ player, line, bench = false, sub = null }: PlayerCardProps) {
  return (
    <div
      className={[
        'player-card relative flex flex-col overflow-hidden rounded',
        bench ? 'w-[66px] opacity-90 saturate-[.85]' : 'w-[66px]',
      ].join(' ')}
    >
      <div className="player-card-photo relative h-[58px] overflow-hidden">
        {/* Not the 40x40 variant: that is 80px of image for a 66px slot, which
            is 198px at 3×. The 220 holds; the browser picks it from the set. */}
        <CardPhoto
          photoCode={player.photoCode}
          name={player.name}
          width={66}
          height={84}
          framing={photoFraming(player.photoCode)}
          className="absolute inset-x-0 top-0 h-auto w-full"
        />
        <PlayerFlag player={player} size={11} className="absolute top-0 right-0" />
        {sub && <SubMarker sub={sub} />}
      </div>
      <p
        className="truncate bg-pl-bg px-0.5 text-center text-[10px] leading-4 font-semibold tracking-tight text-pl-text"
        title={player.name}
      >
        {player.name}
      </p>
      <p className="tnum truncate bg-pl-surface-2 px-1 text-center text-[10px] leading-4 text-pl-text" title={line}>
        {line}
      </p>
    </div>
  )
}
