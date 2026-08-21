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
import {
  buildFixturePoints,
  buildFixtures,
  buildGameweeks,
  buildMonths,
  buildPlayers,
  buildSeason,
  buildSquad,
  buildDraftSquads,
  availabilityOf,
  checkBalanceInvariant,
} from './lib/derive.mjs'
import { MANAGER_KEYS } from './images.shared.mjs'
import { findMissingPhotos, formatMissingReport, readOverrides } from './lib/photos.mjs'
import { updateFraming } from './lib/framing.mjs'

/**
 * Must match src/lib/assets.ts. Only used to ask the CDN whether a photo
 * exists, so the smallest size is enough.
 */
const playerPhotoUrl = (code) =>
  `https://resources.premierleague.com/premierleague25/photos/players/40x40/${code}.png`

/** The last-resort tier, checked so the report can say which players hit it. */
const legacyPhotoUrl = (code) =>
  `https://resources.premierleague.com/premierleague/photos/players/40x40/p${code}.png`

/**
 * The photo the cards actually draw, current tier then legacy. With an ETag
 * from a previous measurement the request is conditional, and a 304 comes
 * back as { unchanged: true } without downloading anything. Null if neither
 * tier has a photo.
 */
async function fetchPhotoBuffer(code, etag) {
  const urls = [
    `https://resources.premierleague.com/premierleague25/photos/players/110x140/${code}.png`,
    `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png`,
  ]
  for (const url of urls) {
    try {
      const headers = { 'User-Agent': USER_AGENT }
      if (etag) headers['If-None-Match'] = etag
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
      if (response.status === 304) return { unchanged: true }
      if (!response.ok) continue
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength > 0) return { buffer, etag: response.headers.get('etag') }
    } catch {
      // Treated as missing; it is retried next run because nothing is stored.
    }
  }
  return null
}

const LEAGUE_ID = 23939
const LEAGUE_DISPLAY_NAME = 'FPL Draft 26/27'
const SEASON = '2026/27'

const DRAFT_API = 'https://draft.premierleague.com/api'
const CLASSIC_API = 'https://fantasy.premierleague.com/api'

const DATA_DIR = 'public/data'
const CACHE_DIR = path.join(DATA_DIR, 'cache')
const SQUAD_DIR = path.join(DATA_DIR, 'squads')
const MANAGERS_CONFIG = 'src/config/managers.json'

/** Courtesy to FPL: identify ourselves and stay well clear of their limits. */
const USER_AGENT =
  'RSM-Draft-Tracker/1.0 (11-manager private league tracker; https://github.com/rowan-m-s/RSM-Draft; rowan-m-s on GitHub)'
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
 * One manager's fifteen for one gameweek, validated before use.
 *
 * Positions 1–11 are the starting XI and 12–15 the bench. Draft applies
 * automatic substitutions after the gameweek finishes and reports them in a
 * `subs` array.
 */
function readPicks(payload, entryId, event) {
  const picks = payload?.picks
  if (!Array.isArray(picks) || picks.length === 0) {
    throw new FetchError(
      `entry/${entryId}/event/${event}: expected a "picks" array, got keys [${Object.keys(payload ?? {})}]`
    )
  }
  if (picks.some((p) => typeof p.element !== 'number' || typeof p.position !== 'number')) {
    throw new FetchError(
      `entry/${entryId}/event/${event}: a pick is missing element/position — keys [${Object.keys(picks[0])}]`
    )
  }

  const starters = picks.filter((p) => p.position >= 1 && p.position <= 11)
  if (starters.length !== 11) {
    throw new FetchError(
      `entry/${entryId}/event/${event}: expected 11 starters at positions 1-11, found ${starters.length}`
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
  }

  return buildSquad({ picks, subs: payload.subs ?? [] })
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
  // Draft has no fixtures endpoint. The classic game serves all 380 in one
  // call and the two use identical team ids — verified, not assumed.
  const allFixtures = await getJson(`${CLASSIC_API}/fixtures/`)
  // The draft picks. Note the path: league/{id}/choices is a 404, it is
  // draft/{id}/choices. Verified against the live payload.
  const draftChoices = await getJson(`${DRAFT_API}/draft/${LEAGUE_ID}/choices`)

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

  // The fixtures come from the classic game but are rendered against Draft's
  // teams, so the id spaces have to line up.
  const draftTeamsById = new Map(teams.map((t) => [t.id, t.short_name]))
  const teamMismatch = (classicBootstrap.teams ?? []).filter(
    (t) => draftTeamsById.has(t.id) && draftTeamsById.get(t.id) !== t.short_name
  )
  if (teamMismatch.length > 0) {
    throw new FetchError(
      `Draft and classic disagree on ${teamMismatch.length} team id(s) — e.g. ${teamMismatch[0].id} is ` +
        `"${draftTeamsById.get(teamMismatch[0].id)}" in Draft and "${teamMismatch[0].short_name}" in classic. ` +
        `Fixtures would be attributed to the wrong clubs.`
    )
  }

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

  /* Squads per gameweek.
     Picks exist once a deadline has passed, so this covers more than the
     confirmed weeks: the current in-flight week is fetched too, which is what
     lets the squad page show a live gameweek. Only confirmed weeks are cached,
     because auto-subs can still move players before then. */
  const perGw = {}
  const squadFiles = []
  const now = Date.now()
  const locked = events.filter((e) => new Date(e.deadline_time).getTime() <= now)

  for (const event of locked) {
    const dataChecked = classicDataCheckedById.get(event.id) && event.finished
    const cached = dataChecked ? await readCache(event.id) : null
    if (cached) {
      perGw[event.id] = cached
      squadFiles.push(cached)
      continue
    }

    log(`Fetching squads and points for GW${event.id}...`)
    const squads = {}
    let unavailable = false
    for (const manager of enrichedManagers) {
      try {
        const payload = await getJson(`${DRAFT_API}/entry/${manager.entryId}/event/${event.id}`)
        squads[manager.key] = readPicks(payload, manager.entryId, event.id)
      } catch (error) {
        // FPL can lag between a deadline passing and picks being published.
        // That is a "not yet", not a failure — skip the week rather than
        // failing the whole run and blocking the scores from updating.
        if (String(error.message).includes('404')) {
          log(`  GW${event.id} picks not published yet (${manager.key}) — skipping this gameweek.`)
          unavailable = true
          break
        }
        throw error
      }
    }
    if (unavailable) continue

    const livePayload = await getJson(`${DRAFT_API}/event/${event.id}/live`)
    const live = readLivePoints(livePayload, event.id)
    const used = new Set(Object.values(squads).flat().map((pick) => String(pick.element)))
    const elementPoints = Object.fromEntries(Object.entries(live).filter(([id]) => used.has(id)))

    // Per-fixture breakdown for the owned players, from the same Draft
    // payload, so the parts are scored by Draft's rules and a double
    // gameweek is split by fixture. A part that does not add up to the
    // week total is reported: it means the explain is not the shape
    // expected, and the Fixtures page should not be trusted for that week.
    const fixturePoints = buildFixturePoints({ live: livePayload, elementIds: [...used] })
    if (fixturePoints.mismatched.length > 0) {
      log(
        `  GW${event.id}: ${fixturePoints.mismatched.length} player(s) whose per-fixture points do not sum to ` +
          `their total, e.g. element ${fixturePoints.mismatched[0].element} ` +
          `(${fixturePoints.mismatched[0].explained} explained vs ${fixturePoints.mismatched[0].total}).`
      )
    }

    // The top-performer maths wants the scoring XI only.
    const scoringXI = Object.fromEntries(
      Object.entries(squads).map(([key, picks]) => [key, picks.filter((p) => p.starter).map((p) => p.element)])
    )

    const record = {
      event: event.id,
      deadlineUtc: event.deadline_time,
      started: Boolean(event.finished) || Object.keys(live).length > 0,
      finished: Boolean(event.finished),
      dataChecked: Boolean(dataChecked),
      squads,
      scoringXI,
      elementPoints,
      fixturePoints: fixturePoints.byFixture,
    }
    perGw[event.id] = record
    squadFiles.push(record)
    if (dataChecked) await writeCache(event.id, record)
  }

  /* GW0, the initial draft. Always available, and the only squad view there
     is until the first deadline passes. */
  const choices = draftChoices?.choices ?? []
  if (choices.length > 0) {
    const positionById = new Map(
      elements.map((e) => [e.id, ['', 'GKP', 'DEF', 'MID', 'FWD'][e.element_type]])
    )
    const keyByEntryId = new Map(managers.map((m) => [m.entryId, m.key]))
    const { squads, formations } = buildDraftSquads({
      choices,
      keyByEntryId,
      positionOf: (id) => positionById.get(id),
    })

    const covered = Object.keys(squads)
    if (covered.length !== managers.length) {
      throw new FetchError(
        `Draft covers ${covered.length}/${managers.length} managers. ` +
          `Missing: ${managers.filter((m) => !covered.includes(m.key)).map((m) => m.key).join(', ')}.`
      )
    }
    log(`GW0 draft: ${choices.length} picks, inferred XIs ${Object.values(formations).join(' ')}`)

    squadFiles.push({
      event: 0,
      isDraft: true,
      deadlineUtc: leagueDetails.league?.draft_dt ?? null,
      started: false,
      finished: false,
      dataChecked: false,
      squads,
      elementPoints: {},
    })
  } else {
    log('No draft picks yet, so no GW0.')
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

  const gameweeks = buildGameweeks({ events, classicDataCheckedById, scoresByGw, perGw, elementName })
  const months = buildMonths({ gameweeks, managerKeys, perGw, elementName })
  const season = buildSeason({ gameweeks, months, managerKeys, generatedAt, perGw, elementName })
  const fixtures = buildFixtures({ fixtures: allFixtures, teams, generatedAt })
  const players = buildPlayers({
    elements,
    teams,
    ownerByElementId,
    generatedAt,
    gameweeksPlayed: finished.length,
  })

  const invariant = checkBalanceInvariant({ season, months })
  if (!invariant.ok) {
    throw new FetchError(
      `Balance invariant failed. The eleven balances sum to ${invariant.sum} but the unpaid pot is ` +
        `${invariant.unpaidPot}, so they should sum to ${invariant.expected}. The money maths is wrong — ` +
        `refusing to publish.`
    )
  }
  log(`Balances sum to ${invariant.sum} against an unpaid pot of ${invariant.unpaidPot}. Invariant holds.`)

  // Published with the data so the browser never has to probe for an override
  // that is not there.
  const overrides = await readOverrides()

  const league = {
    name: leagueDetails.league?.name ?? 'RSM Draft',
    displayName: LEAGUE_DISPLAY_NAME,
    season: SEASON,
    managers: enrichedManagers,
    playerImageOverrides: [...overrides].sort((a, b) => a - b),
    // Which gameweeks have a squad to show. Picks do not exist in Draft until
    // a deadline passes, so a future week has nothing to render and is simply
    // not offered on the slider.
    availableSquads: squadFiles.map((r) => r.event).sort((a, b) => a - b),
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
    ['fixtures.json', fixtures],
  ]) {
    results.push(await writeIfChanged(file, payload, startedAt))
  }

  /* One file per gameweek, so the squad page loads only the week it needs.
     Eleven managers x fifteen players x thirty-eight weeks in a single file
     would be a needless payload on every visit. */
  await mkdir(SQUAD_DIR, { recursive: true })
  await mkdir(path.join(DATA_DIR, 'points'), { recursive: true })
  const elementById = new Map(elements.map((e) => [e.id, e]))
  // Every player whose photo appears on a card: current squads and every
  // week's squad file. Measured for framing below.
  const cardPhotoCodes = new Set(players.owned.map((p) => p.photoCode))
  for (const record of squadFiles) {
    // Carry the player details the page needs. A player traded away weeks ago
    // will not be in players.json's owned list, so the file has to stand alone.
    const referenced = new Set(Object.values(record.squads).flat().map((pick) => pick.element))
    const playerDetails = {}
    for (const id of referenced) {
      const element = elementById.get(id)
      if (!element) continue
      const team = teams.find((t) => t.id === element.team)
      cardPhotoCodes.add(element.code)
      playerDetails[id] = {
        name: element.web_name,
        position: ['', 'GKP', 'DEF', 'MID', 'FWD'][element.element_type],
        teamId: element.team,
        clubShort: team?.short_name ?? '???',
        clubCode: team?.code ?? 0,
        photoCode: element.code,
        ...availabilityOf(element),
      }
    }

    const payload = {
      event: record.event,
      isDraft: Boolean(record.isDraft),
      deadlineUtc: record.deadlineUtc,
      started: record.started,
      finished: record.finished,
      dataChecked: record.dataChecked,
      squads: Object.fromEntries(
        Object.entries(record.squads).map(([key, picks]) => [
          key,
          picks.map((pick) => ({ ...pick, points: record.elementPoints[pick.element] ?? 0 })),
        ])
      ),
      players: playerDetails,
      generatedAt,
    }
    results.push(await writeIfChanged(path.join('squads', `gw${record.event}.json`), payload, startedAt))

    // The per-fixture breakdown is its own file, loaded by the Fixtures page
    // for the week on show, so the squad file stays light.
    if (record.fixturePoints) {
      results.push(
        await writeIfChanged(
          path.join('points', `gw${record.event}.json`),
          {
            event: record.event,
            started: record.started,
            finished: record.finished,
            dataChecked: record.dataChecked,
            byFixture: record.fixturePoints,
            generatedAt,
          },
          startedAt
        )
      )
    }
  }

  /* Photo framing, per player, measured from the photo and cached in the
     published file itself against the CDN's ETag. Known codes are
     revalidated with a conditional request and only re-measured if the CDN
     has replaced the photo; new codes are measured. Overrides are cut to
     the standard composition by hand, so they are not measured and render
     at 1. */
  log('\nChecking photo framing...')
  const framingFile = path.join(DATA_DIR, 'photo-framing.json')
  let existingFraming = {}
  try {
    existingFraming = JSON.parse(await readFile(framingFile, 'utf8')).framing ?? {}
  } catch {
    // First run, or the file was removed to force a full re-measure.
  }
  const { framing, stats } = await updateFraming({
    codes: [...cardPhotoCodes].filter((code) => !overrides.has(code)),
    existing: existingFraming,
    fetchPhoto: fetchPhotoBuffer,
    log,
  })
  log(`  ${stats.unchanged} unchanged, ${stats.measured} measured, ${stats.failed} without a photo or unmeasurable.`)
  results.push(await writeIfChanged('photo-framing.json', { framing, generatedAt }, startedAt))

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
  if (overrides.size > 0) log(`Local photo overrides in use: ${overrides.size}.`)

  /* Which owned players still have no picture. Runs after everything is
     written, and never fails the job: a missing photo is cosmetic, and the
     scores must not be held up by the CDN being slow. */
  log('\nChecking photos for owned players...')
  try {
    const missing = await findMissingPhotos({
      owned: players.owned,
      overrides,
      userAgent: USER_AGENT,
      photoUrl: playerPhotoUrl,
      legacyPhotoUrl,
    })
    const nameOf = (key) => enrichedManagers.find((m) => m.key === key)?.displayName ?? key
    log(formatMissingReport(missing, nameOf))
  } catch (error) {
    log(`Photo check skipped: ${error.message}`)
  }
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`)
  if (!(error instanceof FetchError)) console.error(error)
  console.error('\nNothing was written. The previously published data is untouched.')
  process.exit(1)
})
