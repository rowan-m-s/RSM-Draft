import { useEffect, useRef, useState } from 'react'

/**
 * The gameweek picker, shared by the League Table's gameweek view and the
 * squad page so the two behave identically.
 *
 * A slider rather than a dropdown: 38 sequential values, and it works well
 * under a thumb.
 */
export function GameweekSlider({
  value,
  min,
  max,
  onChange,
  playTo,
  labelFor = (gameweek) => `GW${gameweek}`,
  className = '',
}: {
  value: number
  min: number
  max: number
  onChange: (gameweek: number) => void
  /** Highest gameweek the play button steps to. Omit to hide the button. */
  playTo?: number
  /** How to name a position. GW0 is the draft, not a gameweek. */
  labelFor?: (gameweek: number) => string
  className?: string
}) {
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Never leave an interval running after the component goes away.
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), [])

  const stop = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setPlaying(false)
  }

  const play = () => {
    if (playing) return stop()
    if (playTo === undefined || playTo <= min) return
    let current = min
    onChange(current)
    setPlaying(true)
    timer.current = setInterval(() => {
      current += 1
      if (current > playTo) return stop()
      onChange(current)
    }, 700)
  }

  return (
    <div className={`card flex items-center gap-3 p-3 ${className}`}>
      {playTo !== undefined && (
        <button
          type="button"
          onClick={play}
          aria-label={playing ? 'Stop' : 'Play through the season'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pl-text text-pl-bg hover:bg-pl-muted"
        >
          {playing ? '■' : '▶'}
        </button>
      )}
      <input
        type="range"
        disabled={min >= max}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          stop()
          onChange(Number(event.target.value))
        }}
        aria-label="Gameweek"
        className="gw-slider flex-1"
      />
      <span className="display tnum shrink-0 text-right text-xl whitespace-nowrap text-pl-text">
        {labelFor(value)}
      </span>
    </div>
  )
}
