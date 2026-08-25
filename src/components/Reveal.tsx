import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CardImage } from './Img'
import { money } from '../lib/season'
import type { Dataset } from '../data'
import type { ManagerKey } from '../types'

/**
 * The breaking news sting for a confirmed Koch of the Week or Manager of the
 * Month. Television mechanics, our palette: a colour panel wipes in, BREAKING
 * cuts in hard, the panel wipes out to the card, a ticker runs the headline.
 * Roughly two and a half seconds, all linear and stepped, no easing, no sound.
 *
 * Rules, all kept here:
 *  - fires on confirmation only: a Koch needs the week's dataChecked, a MOTM
 *    needs the month settled. Provisional cards never reach this component.
 *  - and not before 09:00 London on the day after the week's last match
 *    (for a MOTM, the month's last week), however early FPL confirms. So it
 *    plays the first time someone opens the site after that.
 *  - plays once per person: seen ids are kept in localStorage, so once it
 *    has shown on a device it never shows there again.
 *  - dismissable at any point, by tap, the button or Escape.
 *  - reduced motion skips straight to the card, ticker static.
 *  - Koch queues before MOTM when both land together.
 *  - only the latest award of each type is news; older ones are marked seen
 *    silently, so a new phone is not greeted by the whole season.
 *
 * `?reveal=preview` plays the latest confirmed awards regardless of what has
 * been seen, and does not mark them seen. For checking it without waiting
 * for a Tuesday.
 */

const SEEN_KEY = 'rsm:reveals-seen'
const STALE_DAYS = 10

interface RevealItem {
  id: string
  kind: 'koch' | 'motm'
  /** Not before this instant, whatever the data says. */
  revealFromUtc: string | null
  managerKeys: ManagerKey[]
  points: number
  /** Which graphic set, per manager. */
  setFor: (key: ManagerKey) => 'koch' | 'motm'
  playerCodeFor?: (key: ManagerKey) => number | null
  label: string
  /** The manager's MVP for the period, on the MOTM card and ticker. */
  mvp?: { playerName: string; points: number } | null
  /** The money line under the number: "−£5" for a Koch, "£20 won" for a MOTM. */
  money: string
  moneyTone: 'red' | 'green'
  /** Extra for the ticker, e.g. the Koch's scapegoat. */
  tickerExtra?: string
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSeen(ids: Iterable<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]))
  } catch {
    // Private mode, or storage full: the sting plays again next time, which is harmless.
  }
}

/** Every confirmed award, oldest first, Koch before MOTM within a day. */
export function confirmedAwards(data: Dataset): RevealItem[] {
  const items: RevealItem[] = []
  for (const gw of data.gameweeks) {
    if (!gw.dataChecked || gw.kochKeys.length === 0) continue
    items.push({
      id: `koch-gw${gw.id}`,
      kind: 'koch',
      revealFromUtc: gw.revealFromUtc ?? null,
      managerKeys: gw.kochKeys,
      points: gw.scores[gw.kochKeys[0]] ?? 0,
      setFor: () => 'koch' as const,
      playerCodeFor: (key) => gw.kochGraphicByManager?.[key] ?? null,
      label: `Koch of the Week · GW${gw.id}`,
      money: `−${money(5)}`,
      moneyTone: 'red',
      tickerExtra: gw.kochKeys
        .map((key) => gw.scapegoatByManager?.[key])
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((s) => `Scapegoat: ${s.playerName}, ${s.points} ${s.points === 1 ? 'pt' : 'pts'}`)
        .join(' · '),
    })
  }
  for (const month of data.months) {
    if (!month.settled || month.winnerKeys.length === 0) continue
    const lastWeek = data.gameweeks.filter((g) => g.month === month.id).at(-1)
    items.push({
      id: `motm-${month.id}`,
      kind: 'motm',
      revealFromUtc: lastWeek?.revealFromUtc ?? null,
      managerKeys: month.winnerKeys,
      points: month.totals[month.winnerKeys[0]] ?? 0,
      setFor: () => 'motm',
      label: `Manager of the Month · ${month.label}`,
      mvp: month.topPerformerByManager?.[month.winnerKeys[0]] ?? null,
      money: `${money(month.potPerWinner)} won`,
      moneyTone: 'green',
      tickerExtra: (() => {
        const mvp = month.topPerformerByManager?.[month.winnerKeys[0]]
        return mvp ? `MVP: ${mvp.playerName}, ${mvp.points} ${mvp.points === 1 ? 'pt' : 'pts'}` : undefined
      })(),
    })
  }
  return items
}

/** What to play now: the latest unseen of each kind, Koch first, unless stale. */
function queueFor(data: Dataset, seen: Set<string>, preview: boolean): RevealItem[] {
  const all = confirmedAwards(data)
  const latestKoch = [...all].reverse().find((i) => i.kind === 'koch')
  const latestMotm = [...all].reverse().find((i) => i.kind === 'motm')
  const latest = [latestKoch, latestMotm].filter((i): i is RevealItem => Boolean(i))
  if (preview) return latest

  // Anything that is not the latest of its kind is old news: mark it seen
  // without playing, so a fresh device does not replay the season.
  const older = all.filter((i) => !latest.includes(i)).map((i) => i.id)
  if (older.some((id) => !seen.has(id))) writeSeen(new Set([...seen, ...older]))

  // And the latest only counts as news for a while after it lands.
  const generated = new Date(data.generatedAt).getTime()
  const fresh = (item: RevealItem) => {
    const gw =
      item.kind === 'koch'
        ? data.gameweeks.find((g) => `koch-gw${g.id}` === item.id)
        : data.gameweeks.filter((g) => g.month === item.id.replace('motm-', '')).at(-1)
    const expected = gw?.confirmExpectedUtc ? new Date(gw.confirmExpectedUtc).getTime() : generated
    return generated - expected < STALE_DAYS * 24 * 60 * 60 * 1000
  }
  // And never before its reveal time: the morning after the last match.
  const now = Date.now()
  const due = (item: RevealItem) => !item.revealFromUtc || new Date(item.revealFromUtc).getTime() <= now
  return latest.filter((i) => !seen.has(i.id) && due(i) && fresh(i))
}

export function Reveal({ data }: { data: Dataset }) {
  const preview = useMemo(() => new URLSearchParams(window.location.search).get('reveal') === 'preview', [])
  // Re-evaluated whenever the data changes (a reload, or the scheduled
  // refresh landing), so a confirmation that arrives while the tab is open
  // still plays at the right moment.
  const [queue, setQueue] = useState<RevealItem[]>(() => queueFor(data, readSeen(), preview))
  useEffect(() => {
    setQueue((current) => (current.length > 0 ? current : queueFor(data, readSeen(), preview)))
  }, [data, preview])
  const current = queue[0] ?? null

  const dismiss = useCallback(() => {
    if (!current) return
    if (!preview) writeSeen(new Set([...readSeen(), current.id]))
    setQueue((q) => q.slice(1))
  }, [current, preview])

  if (!current) return null
  const nameOf = (key: string) => data.league.managers.find((m) => m.key === key)?.displayName ?? key
  return <Sting key={current.id} item={current} nameOf={nameOf} onDone={dismiss} />
}

/**
 * One sting. The timeline is CSS: every layer has its own keyframes with
 * `steps(1)` or linear timing, started together and offset by delay. The
 * component only knows how to end.
 */
function Sting({ item, nameOf, onDone }: { item: RevealItem; nameOf: (k: string) => string; onDone: () => void }) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const names = item.managerKeys.map(nameOf).join(' & ')
  const headline = `${item.label.split(' · ')[0]}: ${names}, ${item.points} pts`
  // The award and its footnote (scapegoat, MVP) are separate items on the
  // ticker, each with its own slot and a gap between, not one run-on line.
  const tickerItems = [headline, item.tickerExtra].filter((t): t is string => Boolean(t))
  const tone = item.kind === 'koch' ? 'pink' : 'green'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onDone])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={headline}
      onClick={onDone}
      className={`sting fixed inset-0 z-50 overflow-hidden bg-pl-bg text-pl-text select-none sting-${tone} ${reduced ? 'sting-still' : ''}`}
    >
      {/* 1. The panel, wiping in from the left then out to the right, with
          2. BREAKING cut in on it, so it leaves with the panel. */}
      <div className="sting-panel absolute inset-0">
        <div className="sting-breaking absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="display text-[14vw] leading-none tracking-tight sm:text-[9rem]">BREAKING NEWS</p>
          <p className="sting-sub eyebrow mt-4 text-sm sm:text-base">{item.label.split(' · ')[0]}</p>
        </div>
      </div>

      {/* 3. The card, cut in once the panel has gone. */}
      {/* Centred in the space between the dismiss button and the ticker,
          not stacked from the top: on a phone the image, name and score
          otherwise sit in the upper two thirds with a hole beneath. */}
      <div className="sting-card absolute inset-x-0 top-14 bottom-12 flex items-center justify-center overflow-y-auto px-6">
        <div className="flex max-w-3xl flex-col items-center gap-4 sm:flex-row sm:gap-8">
          {item.managerKeys.map((key) => (
            <CardImage
              key={key}
              set={item.setFor(key)}
              playerCode={item.playerCodeFor?.(key) ?? null}
              managerKey={key}
              alt={`${nameOf(key)}, ${item.label}`}
              className="aspect-square w-44 shrink-0 sm:w-96"
            />
          ))}
          <div className="text-center sm:text-left">
            <p className="eyebrow sting-accent-text">{item.label}</p>
            <p className="display mt-2 text-5xl leading-[1.1] sm:text-6xl">{names}</p>
            <p className="mt-3 text-lg text-pl-muted">
              <span className="display tnum sting-accent-text text-5xl">{item.points}</span> pts
            </p>
            {item.mvp && (
              <p className="mt-2 text-lg text-pl-muted">
                MVP · <span className="font-semibold text-pl-text">{item.mvp.playerName}</span>{' '}
                <span className="tnum">
                  ({item.mvp.points} {item.mvp.points === 1 ? 'pt' : 'pts'})
                </span>
              </p>
            )}
            {/* The consequence, set apart from the score it follows. */}
            <p
              className={`display mt-5 border-t border-pl-border pt-4 text-2xl sm:mt-6 ${item.moneyTone === 'red' ? 'text-pl-red' : 'text-pl-green'}`}
            >
              {item.money}
            </p>
          </div>
        </div>
      </div>

      {/* 4. The ticker. */}
      <div className="sting-ticker absolute inset-x-0 bottom-0 flex h-12 items-center overflow-hidden border-t border-pl-border bg-pl-surface pb-[env(safe-area-inset-bottom)]">
        <span className="display sting-accent-bg z-10 flex h-full shrink-0 items-center px-4 text-sm tracking-wider text-pl-bg uppercase">
          Breaking news
        </span>
        {/* Two identical halves, the track slides one half-width then repeats,
            so the bar is always full and the loop is seamless. */}
        <div className="sting-ticker-track flex whitespace-nowrap">
          {[0, 1].map((half) => (
            <span key={half} className="flex shrink-0">
              {[0, 1, 2, 3, 4, 5].flatMap((i) =>
                tickerItems.map((text, j) => (
                  <span key={`${i}-${j}`} className="flex items-center gap-10 pl-10">
                    <span className="text-sm font-semibold tracking-wide uppercase">{text}</span>
                    <span className="sting-accent-bg h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                  </span>
                ))
              )}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          // The overlay dismisses on any tap; do not let this tap count twice.
          event.stopPropagation()
          onDone()
        }}
        className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 z-20 rounded border border-pl-border bg-pl-bg/60 px-2.5 py-1 text-xs font-semibold text-pl-text"
      >
        Dismiss
      </button>
    </div>,
    document.body
  )
}
