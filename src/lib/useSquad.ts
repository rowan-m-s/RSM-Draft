import { useEffect, useState } from 'react'
import { asset } from './assets'
import type { FixturesFile, SquadFile } from '../types'

/**
 * Squad and fixture data, fetched only when the squad page needs it.
 *
 * These are deliberately not part of the main dataset. Fixtures are 104 KB and
 * every gameweek has its own squad file — eleven managers by fifteen players by
 * thirty-eight weeks in one payload would be downloaded by everyone who only
 * wanted to look at the league table.
 *
 * A missing squad file is an expected state, not an error: picks do not exist
 * until a deadline has passed. The slider only offers weeks that have one, so
 * the page should only meet a missing file if the data is mid-update.
 */

const cache = new Map<string, unknown>()

async function loadJson<T>(path: string): Promise<T | null> {
  if (cache.has(path)) return cache.get(path) as T

  const response = await fetch(asset(path))

  // A missing file is an expected state, not an error. Two shapes of missing:
  // a real 404 (what GitHub Pages sends), and a single-page-app fallback that
  // answers 200 with index.html (what the dev server sends). Parsing the
  // second as JSON throws a confusing syntax error, so check the type.
  const isJson = (response.headers.get('content-type') ?? '').includes('json')
  if (!response.ok || !isJson) {
    if (response.status === 404 || !isJson) {
      cache.set(path, null)
      return null
    }
    throw new Error(`${path} failed with HTTP ${response.status}`)
  }

  const data = (await response.json()) as T
  cache.set(path, data)
  return data
}

export function useSquad(gameweek: number | null) {
  const [squad, setSquad] = useState<SquadFile | null>(null)
  const [fixtures, setFixtures] = useState<FixturesFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    // Loaded independently, so a failed squad fetch still leaves fixtures.
    Promise.allSettled([
      gameweek === null ? Promise.resolve(null) : loadJson<SquadFile>(`data/squads/gw${gameweek}.json`),
      loadJson<FixturesFile>('data/fixtures.json'),
    ])
      .then(([squadResult, fixturesResult]) => {
        if (cancelled) return
        setSquad(squadResult.status === 'fulfilled' ? squadResult.value : null)
        setFixtures(fixturesResult.status === 'fulfilled' ? fixturesResult.value : null)

        const failure = [squadResult, fixturesResult].find((r) => r.status === 'rejected')
        setError(failure ? String((failure as PromiseRejectedResult).reason) : null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [gameweek])

  return { squad, fixtures, loading, error }
}
