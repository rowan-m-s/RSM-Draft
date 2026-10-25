import { useEffect, useState } from 'react'
import { asset } from './assets'
import type { FixturesFile, PointsFile, SquadFile } from '../types'

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
 *
 * Fetched the same way as the main dataset (see data.tsx's comment for the
 * full reasoning): raw.githubusercontent.com in production, so a data commit
 * publishes itself with no redeploy, and same-origin in dev. This file used
 * to call asset(path) directly and was missed when that migration happened —
 * fixtures and squads kept reading whatever was last baked into a code
 * deploy, frozen for as long as nothing else forced one, which is exactly
 * the staleness that migration was meant to end.
 */

const REPO_RAW_BASE = 'https://raw.githubusercontent.com/rowan-m-s/RSM-Draft/main/public'

function dataUrl(path: string): string {
  if (import.meta.env.DEV) return asset(path)
  return `${REPO_RAW_BASE}/${path}?t=${Date.now()}`
}

const cache = new Map<string, unknown>()

async function loadJson<T>(path: string): Promise<T | null> {
  if (cache.has(path)) return cache.get(path) as T

  // Revalidated on every page load, as the main dataset is; see data.tsx.
  const response = await fetch(dataUrl(path), { cache: 'no-cache' })

  // A missing file is an expected state, not an error. In production this
  // fetches raw.githubusercontent.com, which answers a real 404 for anything
  // absent and serves every file, present or not, as text/plain regardless of
  // extension — checking content-type there would misread every real file as
  // missing. In dev the fetch is same-origin against the dev server, which
  // instead answers 200 with index.html (the single-page-app fallback) for
  // anything it doesn't recognise, not real JSON, so that case still needs
  // its own check; this is why it's scoped to DEV rather than dropped outright.
  const isDevFallback = import.meta.env.DEV && !(response.headers.get('content-type') ?? '').includes('json')
  if (response.status === 404 || isDevFallback) {
    cache.set(path, null)
    return null
  }
  if (!response.ok) {
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
    ]).then(([squadResult, fixturesResult]) => {
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

/** The season's fixtures alone, for the Fixtures page. Same cache as above. */
export function useFixtures() {
  const [fixtures, setFixtures] = useState<FixturesFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadJson<FixturesFile>('data/fixtures.json')
      .then((data) => {
        if (cancelled) return
        setFixtures(data)
        setLoading(false)
      })
      .catch((reason) => {
        if (cancelled) return
        setError(String(reason))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { fixtures, loading, error }
}

/**
 * The per-fixture points for one gameweek, for the Fixtures page. Null until
 * the week has a file, which is once its deadline has passed and the live
 * endpoint has answered; a missing file is the normal state for a future
 * week, not an error.
 */
export function usePoints(gameweek: number) {
  const [points, setPoints] = useState<PointsFile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadJson<PointsFile>(`data/points/gw${gameweek}.json`)
      .then((data) => {
        if (cancelled) return
        setPoints(data)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setPoints(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [gameweek])

  return { points, loading }
}
