import { useEffect, useState } from 'react'
import { relativeAge } from '../lib/season'
import { useDataState } from '../data'

const REPO_ACTIONS_URL = 'https://github.com/rowan-m-s/RSM-Draft/actions'

/** Shows the outcome of a manual reload for a few seconds, then lets the age speak again. */
function useReloadNotice(lastReload: { outcome: string; at: number } | null, holdMs = 3000) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!lastReload) return
    setVisible(true)
    const id = setTimeout(() => setVisible(false), holdMs)
    return () => clearTimeout(id)
  }, [lastReload, holdMs])
  return visible ? lastReload : null
}

/** A small turning ring, for the moment the data is being re-read. */
function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="animate-spin">
      <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".3" />
      <path
        d="M10.5 6a4.5 4.5 0 0 0-4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

const NOTICE: Record<string, string> = {
  updated: 'Updated just now',
  unchanged: 'Already up to date',
  failed: 'Reload failed, showing the last data',
}

/** Ticks every 30s so "14 minutes ago" ages without a reload. */
function useAge(generatedAt: string | null) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return generatedAt ? relativeAge(generatedAt, now) : null
}

/**
 * How old the data is.
 *
 * A silently dead fetch job is this design's main failure mode — the site keeps
 * rendering last week's numbers and looks fine. So the age is always on screen,
 * and turns amber past three hours.
 */
export function Freshness({ compact = false }: { compact?: boolean }) {
  const { state, reload, reloading, lastReload } = useDataState()
  const age = useAge(state.status === 'ready' ? state.data.generatedAt : null)
  const notice = useReloadNotice(lastReload)

  if (!age) return null

  const tone = age.stale ? 'font-semibold text-pl-amber' : 'text-pl-muted'
  const label = reloading ? 'Reloading…' : notice ? NOTICE[notice.outcome] : `Updated ${age.text}`
  const labelTone = notice?.outcome === 'failed' ? 'font-semibold text-pl-amber' : notice ? 'text-pl-text' : tone

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs ${labelTone}`} aria-live="polite">
        {reloading && <Spinner />}
        {label}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`inline-flex items-center gap-1.5 text-xs ${labelTone}`} aria-live="polite">
        {reloading && <Spinner />}
        {label}
      </span>
      <button
        type="button"
        onClick={reload}
        disabled={reloading}
        className="rounded border border-pl-border px-2 py-1 text-xs font-semibold text-pl-text hover:bg-pl-surface-2 disabled:opacity-50"
      >
        Reload
      </button>
    </div>
  )
}

/**
 * The reload control, spelled out.
 *
 * "Reload" is not "Refresh": GitHub Pages has no serverless functions and a
 * token must never reach the browser of a public repo, so nothing here can pull
 * new data from FPL. All this does is re-read the JSON files past the browser
 * cache. Forcing an actual update means running the Action, which only the
 * repo owner can do.
 */
export function DataFooter() {
  const { state, reload, reloading, lastReload } = useDataState()
  const age = useAge(state.status === 'ready' ? state.data.generatedAt : null)
  const notice = useReloadNotice(lastReload)

  return (
    <section className="card p-5">
      <p className="eyebrow text-pl-muted">Data</p>
      <p
        className={`mt-2 inline-flex items-center gap-2 text-sm ${age?.stale || notice?.outcome === 'failed' ? 'font-semibold text-pl-amber' : 'text-pl-text'}`}
        aria-live="polite"
      >
        {reloading && <Spinner />}
        {reloading ? 'Reloading…' : notice ? NOTICE[notice.outcome] : `Updated ${age?.text ?? 'never'}`}
        {!notice && age?.stale && '. The update job may have stopped.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reload}
          disabled={reloading}
          className="rounded-md bg-pl-text px-4 py-2 text-sm font-semibold text-pl-bg hover:bg-pl-muted disabled:opacity-50"
        >
          Reload
        </button>
        <a
          href={REPO_ACTIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-pl-border px-4 py-2 text-sm font-semibold text-pl-text hover:bg-pl-surface-2"
        >
          Force update (admin)
        </a>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-pl-muted">
        Reload re-reads the stored data so you are not looking at a stale copy held by your browser. It does not pull
        new scores from FPL. That happens on a schedule, every 15 minutes on match days. Force update runs the job by
        hand and needs repo access; it takes a couple of minutes, then reload.
      </p>
    </section>
  )
}
