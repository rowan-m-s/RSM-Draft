#!/usr/bin/env node
/**
 * Fetch the league from FPL and write the JSON the site reads.
 *
 *   node scripts/fetch-data.mjs
 *
 * The FPL API sends no CORS headers, so the browser cannot call it. This runs
 * server-side on a schedule and commits the result.
 *
 * Two rules govern everything here:
 *
 *   Fail loudly. A failed fetch exits non-zero so the Action goes red. Nothing
 *   is written until every payload has been built and the money invariant has
 *   been checked, so a partial run can never overwrite good data.
 *
 *   Money only locks once the gameweek is confirmed. Draft applies automatic
 *   substitutions after a gameweek finishes, so `finished` alone is not enough.
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildGameweeks, buildMonths, buildPlayers, buildSeason, checkBalanceInvariant } from './lib/derive.mjs'
import { MANAGER_KEYS } from './images.shared.mjs'

const LEAGUE_ID = 23939
const LEAGUE_DISPLAY_NAME = 'FPL Draft 26/27'
const SEASON = '2026/27'

const DRAFT_API = 'https://draft.premierleague.com/api'
const CLASSIC_API = 'https://fantasy.premierleague.com/api'

const DATA_DIR = 'public/data'
const CACHE_DIR = path.join(DATA_DIR, 'cache')
const MANAGERS_CONFIG = 'src/config/managers.json'

/** Courtesy to FPL: identify ourselves and stay well clear of their limits. */
const USER_AGENT =
  'RSM-Draft-Tracker/1.0 (11-manager private league tracker; https://github.com/rowanmat/RSM-Draft; rowanmat@gmail.com)'
const REQUEST_GAP_MS = 200

/**
 * How long a run may go without rewriting the files.
 *
 * Two requirements pull against each other: only commit when the data actually
 * changed (or a frequent cron produces hundreds of empty commits a week), and
 * show a stale `generatedAt` as a warning past three hours (or a silently dead
 * job goes unnoticed). Left alone, every quiet night would trip the warning.
 *
 * So the files are rewritten when the data changes, and otherwise at most once
 * every two and a half hours as a heartbeat — comfortably inside the three-hour
 * warning, and about nine commits on a completely quiet day.
 */
const HEARTBEAT_MS = 2.5 * 60 * 60 * 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...args) => console.log(...args)

class FetchError extends Error {}

let lastRequestAt = 0

async function getJson(url, { attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const since = Date.now() - lastRequestAt
    if (since < REQUEST_GAP_MS) await sleep(REQUEST_GAP_MS - since)
    lastRequestAt = Date.now()

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        // A 404 is an answer, not a blip — retrying will not change it.
        if (response.status === 404) throw new FetchError(`${url} → 404`)
        throw new Error(`${url} → HTTP ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      if (error instanceof FetchError || attempt === attempts) {
        throw new FetchError(`${error.message} (after ${attempt} attempt${attempt === 1 ? '' : 's'})`)
      }
      const backoff = 500 * 2 ** (attempt - 1)
      log(`  retrying in ${backoff}ms: ${error.message}`)
      await sleep(backoff)
    }
  }
}

/* -------------------------------------------------------------------------
   Shape guards.

   Phase 1 could not verify these: the draft had not happened and no gameweek
   had been played, so picks, history and live all came back empty. Rather than
   quietly computing the wrong money if a field name differs, each reader states
   what it expected and fails with the keys it actually saw.
   ------------------------------------------------------------------------- */

function readHistoryPoints(payload, entryId) {
  const history = payload?.history
  if (!Array.isArray(history)) {
    throw new FetchError(
      `entry/${entryId}/history: expected a "history" array, got keys [${Object.keys(payload ?? {})}]`
    )
  }
  return history.map((row) => {
    const event = row.event ?? row.id
    const points = row.points ?? row.event_points ?? row.total
    if (typeof event !== 'number' || typeof points !== 'number') {
      throw new FetchError(
        `entry/${entryId}/history: cannot read event/points from row keys [${Object.keys(row)}]. ` +
          `Verify the shape and update readHistoryPoints.`
      )
    }
    return { event, points }
  })
}

/**
 * The eleven players who actually scored for a manager that week.
 *
 * Positions 1–11 are the starting XI and 12–15 the bench. Draft applies
 * automatic substitutions after the gameweek finishes and reports them in a
 * `subs` array; this is only ever called for confirmed gameweeks, by which
 * point that array is final.
 */
function readScoringXI(payload, entryId, event) {
  const picks = payload?.picks
  if (!Array.isArray(picks) || picks.length === 0) {
    throw new FetchError(
      `entry/${entryId}/event/${event}: expected a "picks" array, got keys [${Object.keys(payload ?? {})}]`
    )
  }

  const starters = new Set(picks.filter((p) => p.position >= 1 && p.position <= 11).map((p) => p.element))
  if (starters.size !== 11) {
    throw new FetchError(
      `entry/${entryId}/event/${event}: expected 11 starters at positions 1-11, found ${starters.size}`
    )
  }

  for (const sub of payload.subs ?? []) {
    const out = sub.element_out ?? sub.out
    const on = sub.element_in ?? sub.in
    if (typeof out !== 'number' || typeof on !== 'number') {
      throw new FetchError(
        `entry/${entryId}/event/${event}: cannot read a substitution from keys [${Object.keys(sub)}]`
      )
    }
    starters.delete(out)
    starters.add(on)
  }

  return [...starters]
}

function readLivePoints(payload, event) {
  const elements = payload?.elements
  if (!elements || typeof elements !== 'object') {
    throw new FetchError(`event/${event}/live: expected an "elements" object, got keys [${Object.keys(payload ?? {})}]`)
  }
  const points = {}
  for (const [id, entry] of Object.entries(elements)) {
    const value = entry?.stats?.total_points ?? entry?.total_points
    if (typeof value !== 'number') {
      throw new FetchError(
        `event/${event}/live: cannot read total_points for element ${id} from keys [${Object.keys(entry ?? {})}]`
      )
    }
    points[id] = value
  }
  return points
}

/* -------------------------------------------------------------------------
   Cache. Confirmed gameweeks never change again, so they are fetched once.
   ------------------------------------------------------------------------- */

async function readCache(event) {
  try {
    return JSON.parse(await readFile(path.join(CACHE_DIR, `gw-${event}.json`), 'utf8'))
  } catch {
    return null
  }
}

async function writeCache(event, payload) {
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(path.join(CACHE_DIR, `gw-${event}.json`), JSON.stringify(payload) + '\n')
}

/* -------------------------------------------------------------------------
   Writing. Everything is built first; nothing touches disk until it all
   succeeds, and then only if the content actually changed.
   ------------------------------------------------------------------------- */

const withoutTimestamp = ({ generatedAt, ...rest }) => rest

async function writeIfChanged(file, payload, now) {
  const target = path.join(DATA_DIR, file)
  let existing = null
  try {
    existing = JSON.parse(await readFile(target, 'utf8'))
  } catch {
    /* first run */
  }

  const unchanged =
    existing && JSON.stringify(withoutTimestamp(existing)) === JSON.stringify(withoutTimestamp(payload))
  const age = existing?.generatedAt ? now - new Date(existing.generatedAt).getTime() : Infinity

  if (unchanged && age < HEARTBEAT_MS) {
    return { file, written: false, reason: 'unchanged' }
  }

  // Write beside the target and rename, so a crash mid-write cannot leave a
  // truncated file where good data was.
  const temp = `${target}.tmp`
  await writeFile(temp, JSON.stringify(payload, null, 2) + '\n')
  await rename(temp, target)
  return { file, written: true, reason: unchanged ? 'heartbeat' : 'changed' }
}

/* ------------------------------------------------------------------------- */

async function loadManagers() {
  const managers = JSON.parse(await readFile(MANAGERS_CONFIG, 'utf8'))
  const problems = []

  if (managers.length !== MANAGER_KEYS.length) {
    problems.push(`${MANAGERS_CONFIG} has ${managers.length} entries, expected ${MANAGER_KEYS.length}`)
  }
  const seenKeys = new Set()
  const seenIds = new Set()
  for (const manager of managers) {
    if (!MANAGER_KEYS.includes(manager.key)) problems.push(`unknown manager key "${manager.key}"`)
    if (seenKeys.has(manager.key)) problems.push(`duplicate manager key "${manager.key}"`)
    if (seenIds.has(manager.entryId)) problems.push(`duplicate entryId ${manager.entryId}`)
    if (typeof manager.entryId !== 'number') problems.push(`"${manager.key}" has no numeric entryId`)
    if (!manager.displayName) problems.push(`"${manager.key}" has no displayName`)
    seenKeys.add(manager.key)
    seenIds.add(manager.entryId)
  }
  for (const key of MANAGER_KEYS) {
    if (!seenKeys.has(key)) problems.push(`no mapping for manager key "${key}"`)
  }

  if (problems.length) {
    throw new FetchError(`${MANAGERS_CONFIG} is invalid:\n  ${problems.join('\n  ')}`)
  }
  return managers
}

/** Every manager key must have all three images, or a card renders blank. */
async function assertImagesExist() {
  const missing = []
  for (const set of ['icon', 'koch', 'motm']) {
    let files
    try {
      files = await readdir(path.join('public/images', set))
    } catch {
      missing.push(`public/images/${set}/ does not exist`)
      continue
    }
    for (const key of MANAGER_KEYS) {
      for (const format of ['webp', 'jpg']) {
        if (!files.includes(`${key}.${format}`)) missing.push(`public/images/${set}/${key}.${format}`)
      }
    }
  }
  if (missing.length) {
    throw new FetchError(`Missing manager images:\n  ${missing.join('\n  ')}\nRun \`npm run images\`.`)
  }
}

async function main() {
  const startedAt = Date.now()
  const generatedAt = new Date(startedAt).toISOString()

  const managers = await loadManagers()
  await assertImagesExist()
  log(`Mapped ${managers.length} managers, all images present.`)

  // Sequential throughout, so getJson can hold every request 200ms apart.
  log('Fetching bootstrap and league details...')
  const draftBootstrap = await getJson(`${DRAFT_API}/bootstrap-static`)
  const classicBootstrap = await getJson(`${CLASSIC_API}/bootstrap-static/`)
  const leagueDetails = await getJson(`${DRAFT_API}/league/${LEAGUE_ID}/details`)
  const elementStatus = await getJson(`${DRAFT_API}/league/${LEAGUE_ID}/element-status`)

  const events = draftBootstrap.events?.data ?? []
  const elements = draftBootstrap.elements ?? []
  const teams = draftBootstrap.teams ?? []
  if (!events.length || !elements.length || !teams.length) {
    throw new FetchError(`bootstrap-static looks empty: ${events.length} events, ${elements.length} elements`)
  }

  // Draft has no data_checked; the classic game does, and the two share event
  // ids. Verify that assumption rather than trusting it.
  const classicEvents = classicBootstrap.events ?? []
  const mismatched = classicEvents.filter((c) => {
    const d = events.find((e) => e.id === c.id)
    return d && d.deadline_time !== c.deadline_time
  })
  if (mismatched.length) {
    throw new FetchError(
      `Draft and classic disagree on ${mismatched.length} deadline(s) (e.g. GW${mismatched[0].id}). ` +
        `They can no longer be cross-referenced for data_checked.`
    )
  }
  const classicDataCheckedById = new Map(classicEvents.map((e) => [e.id, Boolean(e.data_checked)]))

  // The league's own entries must line up exactly with the hand-filled mapping.
  const leagueEntries = leagueDetails.league_entries ?? []
  const byEntryId = new Map(leagueEntries.map((e) => [e.entry_id, e]))
  const unmapped = leagueEntries.filter((e) => !managers.some((m) => m.entryId === e.entry_id))
  const dangling = managers.filter((m) => !byEntryId.has(m.entryId))
  if (unmapped.length || dangling.length) {
    throw new FetchError(
      `Manager mapping does not match the league:\n` +
        unmapped
          .map((e) => `  league entry ${e.entry_id} (${e.entry_name}, ${e.player_first_name} ${e.player_last_name}) has no mapping`)
          .join('\n') +
        (unmapped.length && dangling.length ? '\n' : '') +
        dangling.map((m) => `  mapping "${m.key}" points at entryId ${m.entryId}, which is not in the league`).join('\n')
    )
  }

  const enrichedManagers = managers.map((manager) => {
    const entry = byEntryId.get(manager.entryId)
    return {
      key: manager.key,
      displayName: manager.displayName,
      entryId: manager.entryId,
      realName: `${entry.player_first_name ?? ''} ${entry.player_last_name ?? ''}`.trim(),
      teamName: entry.entry_name,
    }
  })
  // Each league entry carries two different identifiers and the endpoints do
  // not agree on which to use:
  //
  //   entry_id (121877) — the /entry/{id}/ URLs, and element-status `owner`
  //   id       (122380) — standings `league_entry`
  //
  // Ownership keys off entry_id. Verified against the live payload after the
  // draft, not assumed: the guard below fails loudly if a future season swaps
  // them over, rather than silently handing everyone the wrong squad.
  const keyByOwnerId = new Map(managers.map((m) => [m.entryId, m.key]))

  const finished = events.filter((e) => e.finished)
  log(
    `${events.length} gameweeks, ${finished.length} finished, ` +
      `${finished.filter((e) => classicDataCheckedById.get(e.id)).length} confirmed.`
  )

  /* Per-gameweek scores, from the official per-manager totals. Never summed
     from picks — that is exactly what the auto-subs trap punishes. */
  const scoresByGw = {}
  if (finished.length) {
    log(`Fetching per-gameweek totals for ${managers.length} managers...`)
    for (const manager of enrichedManagers) {
      const payload = await getJson(`${DRAFT_API}/entry/${manager.entryId}/history`)
      for (const { event, points } of readHistoryPoints(payload, manager.entryId)) {
        ;(scoresByGw[event] ??= {})[manager.key] = points
      }
    }
    // Every finished gameweek must have a score for all eleven, or the lowest
    // scorer is decided from a partial table and the wrong person pays.
    for (const event of finished) {
      const got = Object.keys(scoresByGw[event.id] ?? {})
      if (got.length !== managers.length) {
        throw new FetchError(
          `GW${event.id} is finished but only ${got.length}/${managers.length} managers have a score. ` +
            `Refusing to pick a Koch from a partial table.`
        )
      }
    }
  }

  /* Squads per confirmed gameweek, for the top-performer figures. Cached: a
     confirmed gameweek never changes again. */
  const perGw = {}
  const confirmed = finished.filter((e) => classicDataCheckedById.get(e.id))
  for (const event of confirmed) {
    const cached = await readCache(event.id)
    if (cached) {
      perGw[event.id] = cached
      continue
    }

    log(`Fetching squads and live points for GW${event.id}...`)
    const scoringXI = {}
    for (const manager of enrichedManagers) {
      const payload = await getJson(`${DRAFT_API}/entry/${manager.entryId}/event/${event.id}`)
      scoringXI[manager.key] = readScoringXI(payload, manager.entryId, event.id)
    }

    const live = readLivePoints(await getJson(`${DRAFT_API}/event/${event.id}/live`), event.id)
    // Keep only the players who actually scored for someone — the full live
    // payload is ~600 players and this file is committed.
    const used = new Set(Object.values(scoringXI).flat().map(String))
    const elementPoints = Object.fromEntries(Object.entries(live).filter(([id]) => used.has(id)))

    perGw[event.id] = { event: event.id, scoringXI, elementPoints }
    await writeCache(event.id, perGw[event.id])
  }

  /* Ownership. One call covers all eleven squads and every free agent. */
  const ownerByElementId = new Map()
  for (const row of elementStatus.element_status ?? []) {
    const key = row.owner == null ? null : keyByOwnerId.get(row.owner)
    if (row.owner != null && !key) {
      const asLeagueEntry = leagueEntries.find((e) => e.id === row.owner)
      throw new FetchError(
        `element-status: player ${row.element} is owned by ${row.owner}, which is not any manager's entryId.` +
          (asLeagueEntry
            ? ` It matches league entry id ${asLeagueEntry.id} (${asLeagueEntry.entry_name}) instead — ` +
              `the API has switched from entry_id to id and keyByOwnerId needs updating.`
            : '')
      )
    }
    if (key) ownerByElementId.set(row.element, key)
  }

  /* ---- derive ---- */

  const managerKeys = enrichedManagers.map((m) => m.key)
  const elementName = (id) => elements.find((e) => e.id === Number(id))?.web_name ?? `Player ${id}`

  const gameweeks = buildGameweeks({ events, classicDataCheckedById, scoresByGw })
  const months = buildMonths({ gameweeks, managerKeys, perGw, elementName })
  const season = buildSeason({ gameweeks, months, managerKeys, generatedAt })
  const players = buildPlayers({ elements, teams, ownerByElementId, generatedAt })

  const invariant = checkBalanceInvariant({ season, months })
  if (!invariant.ok) {
    throw new FetchError(
      `Balance invariant failed. The eleven balances sum to ${invariant.sum} but the unpaid pot is ` +
        `${invariant.unpaidPot}, so they should sum to ${invariant.expected}. The money maths is wrong — ` +
        `refusing to publish.`
    )
  }
  log(`Balances sum to ${invariant.sum} against an unpaid pot of ${invariant.unpaidPot}. Invariant holds.`)

  const league = {
    name: leagueDetails.league?.name ?? 'RSM Draft',
    displayName: LEAGUE_DISPLAY_NAME,
    season: SEASON,
    managers: enrichedManagers,
    generatedAt,
  }

  /* ---- write ---- */

  await mkdir(DATA_DIR, { recursive: true })
  const results = []
  for (const [file, payload] of [
    ['league.json', league],
    ['gameweeks.json', { gameweeks, generatedAt }],
    ['months.json', { months, generatedAt }],
    ['season.json', season],
    ['players.json', players],
  ]) {
    results.push(await writeIfChanged(file, payload, startedAt))
  }

  const written = results.filter((r) => r.written)
  log('')
  for (const result of results) log(`  ${result.written ? 'wrote' : 'skipped'} ${result.file} (${result.reason})`)
  log(
    `\n${written.length}/${results.length} files written in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` +
      (written.length === 0 ? ' — nothing changed, so there is nothing to commit.' : '.')
  )
  log(
    `Owned ${players.owned.length}, free agents ${players.freeAgents.length}, ` +
      `months ${months.length}, confirmed gameweeks ${gameweeks.filter((g) => g.dataChecked).length}.`
  )
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`)
  if (!(error instanceof FetchError)) console.error(error)
  console.error('\nNothing was written. The previously published data is untouched.')
  process.exit(1)
})
