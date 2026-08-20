import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Gameweek, League, Month, PlayersFile, Season } from './types'
import { mockGameweeks, mockLeague, mockMonths, mockPlayers, mockSeason, MOCK_GENERATED_AT } from './mock'
import { preseason } from './mock/preseason'

export interface Dataset {
  league: League
  gameweeks: Gameweek[]
  months: Month[]
  season: Season
  players: PlayersFile
  generatedAt: string
}

const live: Dataset = {
  league: mockLeague,
  gameweeks: mockGameweeks,
  months: mockMonths,
  season: mockSeason,
  players: mockPlayers,
  generatedAt: MOCK_GENERATED_AT,
}

interface DataContextValue {
  data: Dataset
  /** Bumped by the reload control; nothing reads it yet in the design pass. */
  reloadedAt: number
  reload: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

/**
 * Phase 2 seam. The design pass reads hardcoded mock data; Phase 4 replaces the
 * body of this provider with a fetch of public/data/*.json and nothing else in
 * the app changes.
 *
 * `?state=preseason` swaps in a dataset with no gameweeks played, so the empty
 * states can be reviewed without waiting until August.
 */
export function DataProvider({ children }: { children: ReactNode }) {
  const [reloadedAt, setReloadedAt] = useState(0)

  const data = useMemo(() => {
    const state = new URLSearchParams(window.location.search).get('state')
    return state === 'preseason' ? preseason : live
  }, [])

  const reload = useCallback(() => setReloadedAt(Date.now()), [])

  const value = useMemo(() => ({ data, reloadedAt, reload }), [data, reloadedAt, reload])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used inside DataProvider')
  return context
}
