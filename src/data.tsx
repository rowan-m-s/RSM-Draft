import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Gameweek, League, Month, PlayersFile, ReconciliationRecord, Season } from './types'
import { asset, setPlayerImageOverrides } from './lib/assets'
import { setPhotoFraming } from './lib/photoFraming'

/**
 * Data lives at raw.githubusercontent.com, not in the build.
 *
 * It used to be baked into the bundle: every data commit needed a full
 * Pages redeploy, so update-data dispatched deploy by hand, which fought
 * Pages' own "cancel whatever is still in flight" behaviour, which needed a
 * skip-if-in-flight workaround, which only self-corrects if another
 * change-worthy push follows — a quiet stretch with nothing to push left
 * the site stuck. Fetching straight from the repo at runtime removes the
 * coupling entirely: a data commit publishes itself, and deploy only runs
 * when code changes, rare enough that the cancellation race stops mattering.
 *
 * raw.githubusercontent.com fronts its own CDN cache, so every request here
 * carries a cache-busting query — otherwise a viewer could be held on
 * whatever was first fetched for that CDN's own TTL, the same class of
 * problem as Pages' ten-minute cache, just longer and opaque. In dev this
 * still reads the working tree same-origin instead, so local testing is not
 * hostage to what main happens to have published.
 */
const REPO_RAW_BASE = 'https://raw.githubusercontent.com/rowan-m-s/RSM-Draft/main/public/data'

function dataUrl(name: string): string {
  if (import.meta.env.DEV) return asset(`data/${name}.json`)
  return `${REPO_RAW_BASE}/${name}.json?t=${Date.now()}`
}

/**
 * The last dataset that loaded successfully, kept in localStorage so a
 * fresh page load has something to show immediately — and something to
 * fall back to if the live fetch fails — now that nothing is baked into
 * the build to fall back on. Freshness's own age display is what tells the
 * viewer it might be stale; this just keeps the page from going blank.
 */
const LAST_DATASET_KEY = 'rsm:last-dataset'

function readCachedDataset(): Dataset | null {
  try {
    const raw = localStorage.getItem(LAST_DATASET_KEY)
    return raw ? (JSON.parse(raw) as Dataset) : null
  } catch {
    return null
  }
}

function writeCachedDataset(data: Dataset) {
  try {
    localStorage.setItem(LAST_DATASET_KEY, JSON.stringify(data))
  } catch {
    // Private mode, or storage full: next load just starts from 'loading' instead.
  }
}

export interface Dataset {
  league: League
  gameweeks: Gameweek[]
  months: Month[]
  season: Season
  players: PlayersFile
  /** Addendum §4: gameweeks FPL has confirmed since we locally finalised
   *  them ourselves, and whether the two agreed. */
  reconciliation: ReconciliationRecord[]
  generatedAt: string
}

type State = { status: 'loading' } | { status: 'ready'; data: Dataset } | { status: 'error'; message: string }

interface DataContextValue {
  state: State
  /**
   * Re-reads the JSON past the browser cache. Deliberately not called
   * "refresh": nothing here can pull new scores from FPL. GitHub Pages has no
   * serverless functions and a token must never reach the browser of a public
   * repo, so new data only arrives when the scheduled Action commits it.
   */
  reload: () => void
  reloading: boolean
  /**
   * What the last manual reload found. A reload that returns identical data
   * leaves the timestamp alone, which is indistinguishable from a dead
   * button unless it says so.
   */
  lastReload: { outcome: 'updated' | 'unchanged' | 'failed'; at: number } | null
}

const DataContext = createContext<DataContextValue | null>(null)

const FILES = ['league', 'gameweeks', 'months', 'season', 'players', 'photo-framing', 'reconciliation'] as const

async function loadDataset(cacheBust: number | null): Promise<Dataset> {
  const responses = await Promise.all(
    FILES.map(async (name) => {
      // dataUrl() already cache-busts every call in production (its own
      // CDN, not Pages') — the fetch-level cache option below only still
      // matters in dev, where the URL is same-origin and stable.
      const url = dataUrl(name)
      const response = await fetch(url, { cache: cacheBust === null ? 'no-cache' : 'reload' })
      if (!response.ok) {
        // reconciliation.json is additive, not essential — a league with
        // nothing reconciled yet should still render. Every other file is
        // load-bearing and still fails the whole dataset, same as before.
        if (name === 'reconciliation') return [name, { records: [], generatedAt: new Date(0).toISOString() }] as const
        throw new Error(`${name}.json failed with HTTP ${response.status}`)
      }
      return [name, await response.json()] as const
    })
  )

  const files = Object.fromEntries(responses) as {
    league: League
    gameweeks: { gameweeks: Gameweek[]; generatedAt: string }
    months: { months: Month[]; generatedAt: string }
    season: Season
    players: PlayersFile
    'photo-framing': { framing: Record<string, { scale: number; top: number }>; generatedAt: string }
    reconciliation: { records: ReconciliationRecord[]; generatedAt: string }
  }

  // Published once with the data rather than probed per image.
  setPlayerImageOverrides(files.league.playerImageOverrides)
  setPhotoFraming(files['photo-framing'].framing)

  return {
    league: files.league,
    gameweeks: files.gameweeks.gameweeks,
    months: files.months.months,
    season: files.season,
    players: files.players,
    reconciliation: files.reconciliation.records,
    // The oldest of the five, so a file that stopped updating is what gets
    // reported rather than being hidden by its fresher neighbours.
    generatedAt: [
      files.league.generatedAt,
      files.gameweeks.generatedAt,
      files.months.generatedAt,
      files.season.generatedAt,
      files.players.generatedAt,
    ].sort()[0],
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  // Seeded from the last successful load, if there is one, so the page has
  // something to paint before the network even answers — and something to
  // fall back to if this load fails. Nothing is baked into the build any
  // more for that job to fall back to otherwise.
  const [state, setState] = useState<State>(() => {
    const cached = readCachedDataset()
    return cached ? { status: 'ready', data: cached } : { status: 'loading' }
  })
  const [reloadToken, setReloadToken] = useState<number | null>(null)
  const [reloading, setReloading] = useState(false)
  const [lastReload, setLastReload] = useState<DataContextValue['lastReload']>(null)

  useEffect(() => {
    let cancelled = false
    const manual = reloadToken !== null
    if (manual) setReloading(true)
    const startedAt = performance.now()

    loadDataset(reloadToken)
      .then((data) => {
        if (cancelled) return
        writeCachedDataset(data)
        setState((previous) => {
          if (manual) {
            // Compare what came back with what was showing, and say so. The
            // dataset is small, so a structural comparison is cheap.
            const changed = previous.status !== 'ready' || JSON.stringify(previous.data) !== JSON.stringify(data)
            const ms = Math.round(performance.now() - startedAt)
            console.info(
              `[reload] fetched ${FILES.length} files in ${ms}ms, bypassing the cache: ` +
                (changed
                  ? `data changed (now generated ${data.generatedAt}).`
                  : `identical to what was showing (generated ${data.generatedAt}); nothing new has been published.`)
            )
            setLastReload({ outcome: changed ? 'updated' : 'unchanged', at: Date.now() })
          }
          return { status: 'ready', data }
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        if (manual) {
          console.warn(`[reload] failed: ${message}`)
          setLastReload({ outcome: 'failed', at: Date.now() })
        }
        // Keep showing the data we already had — from this session, or from
        // the cache this mounted with — rather than blanking the page: stale
        // numbers with a visible age beat an empty screen. Only a load that
        // has nothing at all to fall back on shows the error state.
        setState((previous) => (previous.status === 'ready' ? previous : { status: 'error', message }))
      })
      .finally(() => {
        if (!cancelled) setReloading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const reload = useCallback(() => setReloadToken(Date.now()), [])
  const value = useMemo(() => ({ state, reload, reloading, lastReload }), [state, reload, reloading, lastReload])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

/** For the chrome, which renders around whatever state the data is in. */
export function useDataState() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useDataState must be used inside DataProvider')
  return context
}

/**
 * For pages, which only ever render once the data is ready — the shell holds
 * them back until then, so they can treat it as present.
 */
export function useData() {
  const { state, reload, reloading } = useDataState()
  if (state.status !== 'ready') throw new Error('useData used outside a ready Dataset')
  return { data: state.data, reload, reloading }
}
