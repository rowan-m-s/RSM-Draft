import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Gameweek, League, Month, PlayersFile, Season } from './types'
import { asset, setPlayerImageOverrides } from './lib/assets'
import { setPhotoFraming } from './lib/photoFraming'

export interface Dataset {
  league: League
  gameweeks: Gameweek[]
  months: Month[]
  season: Season
  players: PlayersFile
  generatedAt: string
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: Dataset }
  | { status: 'error'; message: string }

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
}

const DataContext = createContext<DataContextValue | null>(null)

const FILES = ['league', 'gameweeks', 'months', 'season', 'players', 'photo-framing'] as const

async function loadDataset(cacheBust: number | null): Promise<Dataset> {
  const suffix = cacheBust === null ? '' : `?t=${cacheBust}`

  const responses = await Promise.all(
    FILES.map(async (name) => {
      const url = asset(`data/${name}.json${suffix}`)
      const response = await fetch(url, { cache: cacheBust === null ? 'default' : 'reload' })
      if (!response.ok) throw new Error(`${name}.json failed with HTTP ${response.status}`)
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
  const [state, setState] = useState<State>({ status: 'loading' })
  const [reloadToken, setReloadToken] = useState<number | null>(null)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (reloadToken !== null) setReloading(true)

    loadDataset(reloadToken)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        // Keep showing the data we already had rather than blanking the page:
        // stale numbers with a visible age beat an empty screen.
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
  const value = useMemo(() => ({ state, reload, reloading }), [state, reload, reloading])

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
