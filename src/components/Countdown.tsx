import { useEffect, useState } from 'react'
import type { Gameweek } from '../types'
import { formatLondon, nextDeadline, nextWaiver, remainingUntil } from '../lib/season'

/** One ticking clock. */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/* Cyan numerals throughout. Urgency is said in the eyebrow and by the card's
   ring rather than by turning the digits pink — pink is reserved for Koch and
   negative balances. */
function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="display tnum text-2xl leading-none text-pl-cyan sm:text-3xl">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-semibold tracking-wider text-pl-muted uppercase">{label}</span>
    </div>
  )
}

function Clock({ target, now }: { target: string; now: Date }) {
  const { days, hours, minutes, seconds } = remainingUntil(target, now)
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <Unit value={days} label="days" />
      <Unit value={hours} label="hrs" />
      <Unit value={minutes} label="min" />
      <Unit value={seconds} label="sec" />
    </div>
  )
}

/**
 * The deadline strip.
 *
 * The timestamps come from FPL but the countdown runs against the device clock,
 * so it stays accurate to the second however old the JSON is. What does rot is
 * *which* deadline to count to — so this picks the first one still in the
 * future from the full list on every tick, rather than trusting a precomputed
 * "next gameweek" field that goes wrong the moment a deadline passes.
 */
export function DeadlineStrip({ gameweeks }: { gameweeks: Gameweek[] }) {
  const now = useNow()
  const deadline = nextDeadline(gameweeks, now)
  const waiver = nextWaiver(gameweeks, now)

  if (!deadline) {
    return (
      <section className="card p-5">
        <p className="eyebrow text-pl-muted">Deadlines</p>
        <p className="display mt-2 text-2xl text-pl-text">That's the season</p>
        <p className="mt-1 text-sm text-pl-muted">
          No gameweeks left. The table is final and the season prize is settled.
        </p>
      </section>
    )
  }

  const urgent = remainingUntil(deadline.deadlineUtc, now).urgent

  return (
    <section
      className={`card overflow-hidden ${urgent ? 'ring-1 ring-pl-cyan' : ''}`}
      aria-label="Upcoming deadlines"
    >
      <div className="grid gap-px bg-pl-border sm:grid-cols-2">
        {waiver && (
          <div className="bg-pl-surface p-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="eyebrow text-pl-muted">Waiver deadline</p>
              <p className="text-xs text-pl-muted">GW{waiver.id}</p>
            </div>
            <div className="mt-3">
              <Clock target={waiver.waiversUtc!} now={now} />
            </div>
            <p className="mt-3 text-xs text-pl-muted">{formatLondon(waiver.waiversUtc!)}</p>
          </div>
        )}
        <div className="bg-pl-surface p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`eyebrow ${urgent ? 'text-pl-cyan' : 'text-pl-muted'}`}>
              {urgent ? 'Deadline within the hour' : 'Gameweek deadline'}
            </p>
            <p className="text-xs text-pl-muted">GW{deadline.id}</p>
          </div>
          <div className="mt-3">
            <Clock target={deadline.deadlineUtc} now={now} />
          </div>
          <p className="mt-3 text-xs text-pl-muted">{formatLondon(deadline.deadlineUtc)}</p>
        </div>
      </div>
    </section>
  )
}
