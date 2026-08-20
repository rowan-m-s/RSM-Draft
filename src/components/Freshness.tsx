import { useEffect, useState } from 'react'
import { relativeAge } from '../lib/season'
import { useData } from '../data'

const REPO_ACTIONS_URL = 'https://github.com/rowanmat/RSM-Draft/actions'

/**
 * How old the data is.
 *
 * A silently dead fetch job is this design's main failure mode — the site keeps
 * rendering last week's numbers and looks fine. So the age is always on screen,
 * and turns pink past three hours.
 */
export function Freshness({ compact = false }: { compact?: boolean }) {
  const { data, reload } = useData()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const age = relativeAge(data.generatedAt, now)

  if (compact) {
    return (
      <span className={`text-xs ${age.stale ? 'font-semibold text-pl-pink' : 'text-pl-muted'}`}>
        Updated {age.text}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`text-xs ${age.stale ? 'font-semibold text-pl-pink' : 'text-pl-muted'}`}>
        Updated {age.text}
      </span>
      <button
        type="button"
        onClick={reload}
        className="rounded border border-pl-border px-2 py-1 text-xs font-semibold text-pl-navy hover:bg-pl-off"
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
  const { data, reload } = useData()
  const age = relativeAge(data.generatedAt)

  return (
    <section className="card p-5">
      <p className="eyebrow text-pl-muted">Data</p>
      <p className={`mt-2 text-sm ${age.stale ? 'font-semibold text-pl-pink' : 'text-pl-navy'}`}>
        Updated {age.text}
        {age.stale && ' — the update job may have stopped.'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reload}
          className="rounded-md bg-pl-purple px-4 py-2 text-sm font-semibold text-pl-white hover:bg-pl-purple-deep"
        >
          Reload
        </button>
        <a
          href={REPO_ACTIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-pl-border px-4 py-2 text-sm font-semibold text-pl-navy hover:bg-pl-off"
        >
          Force update (admin)
        </a>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-pl-muted">
        Reload re-reads the stored data so you are not looking at a stale copy held by your browser. It does not
        pull new scores from FPL — that happens on a schedule, every 15 minutes on match days. Force update runs
        the job by hand and needs repo access; it takes a couple of minutes, then reload.
      </p>
    </section>
  )
}
