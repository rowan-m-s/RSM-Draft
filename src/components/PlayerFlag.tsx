import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { availabilityText, flagColour, flagLabel, type Availability } from '../lib/availability'

/**
 * FPL's availability flag: a small triangle in the corner of the card.
 *
 * The colour is the glance; the news text is the actual information, so it is
 * one tap away and also carried as the accessible name.
 *
 * The tooltip is rendered into a portal and positioned against the viewport.
 * Every place a flag appears — a table row, a card on the pitch — sits inside
 * a container with `overflow-hidden` to keep its corners rounded, which would
 * otherwise clip the tooltip to nothing.
 */
export function PlayerFlag({
  player,
  className = '',
  size = 16,
}: {
  player: Availability
  className?: string
  size?: number
}) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  const colour = flagColour(player.status)
  const text = availabilityText(player)

  const TOOLTIP_WIDTH = 224

  const place = useCallback(() => {
    const rect = button.current?.getBoundingClientRect()
    if (!rect) return
    // Prefer hanging left from the flag, but keep it fully on screen — flags
    // sit at both edges of a table row and of the pitch.
    const left = Math.min(
      Math.max(8, rect.right - TOOLTIP_WIDTH),
      Math.max(8, window.innerWidth - TOOLTIP_WIDTH - 8)
    )
    setBox({ top: rect.bottom + 6, left })
  }, [])

  // A tooltip anchored to the viewport has to follow, or be dismissed.
  useEffect(() => {
    if (!box) return
    const close = () => setBox(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [box])

  if (colour === 'none') return null

  const label = flagLabel(player.status) ?? 'Unavailable'
  const fill = colour === 'red' ? 'var(--color-pl-pink)' : 'var(--color-pl-amber)'

  return (
    <span className={`inline-flex ${className}`}>
      <button
        ref={button}
        type="button"
        aria-label={text ? `${label}: ${text}` : label}
        aria-expanded={box !== null}
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          if (box) setBox(null)
          else place()
        }}
        onMouseEnter={place}
        onMouseLeave={() => setBox(null)}
        onBlur={() => setBox(null)}
        className="block leading-none"
      >
        {/* A right-angled triangle tucked into the corner, as FPL draws it. */}
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="block">
          <path d="M16 0 L16 16 L0 0 Z" fill={fill} />
        </svg>
      </button>

      {box &&
        text &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: box.top, left: box.left, width: TOOLTIP_WIDTH }}
            className="pointer-events-none fixed z-50 rounded-md border border-pl-border bg-pl-surface-2 px-2.5 py-2 text-left text-xs leading-snug font-normal text-pl-text"
          >
            <span className={`block font-semibold ${colour === 'red' ? 'text-pl-pink' : 'text-pl-amber'}`}>
              {label}
            </span>
            <span className="mt-0.5 block text-pl-muted">{text}</span>
          </span>,
          document.body
        )}
    </span>
  )
}
