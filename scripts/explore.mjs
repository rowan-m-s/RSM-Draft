#!/usr/bin/env node
/**
 * Phase 1 — discover the shape of the FPL Draft API.
 *
 * Hits every endpoint we think we need, saves the raw response to .api-samples/
 * (gitignored) and prints enough of the shape to answer the Phase 1 questions.
 *
 * Nothing here is used at runtime. It exists so we verify rather than assume.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'

const LEAGUE_ID = 23939
const API = 'https://draft.premierleague.com/api'
const OUT = path.resolve('.api-samples')
const UA = 'RSM-Draft-Tracker/0.1 (league tracker for 11 mates; contact rowanmat@gmail.com)'

const line = (s = '') => console.log(s)
const head = (s) => {
  line()
  line('='.repeat(72))
  line(s)
  line('='.repeat(72))
}

/** Fetch JSON, save raw body, never throw — a 404 is a finding, not a crash. */
async function get(name, url) {
  await sleep(200)
  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  } catch (err) {
    line(`✗ ${name}  ${url}\n   network error: ${err.message}`)
    return { ok: false, status: 0, data: null }
  }
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* not json */
  }
  await writeFile(path.join(OUT, `${name}.json`), data ? JSON.stringify(data, null, 2) : text)
  const size = (text.length / 1024).toFixed(1)
  line(`${res.ok ? '✓' : '✗'} ${name}  [${res.status}] ${size} KB  ${url}`)
  if (!res.ok) line(`   body: ${text.slice(0, 200)}`)
  return { ok: res.ok, status: res.status, data }
}

const keys = (o) => (o && typeof o === 'object' ? Object.keys(o) : [])

function describe(label, value, depth = 0) {
  const pad = '  '.repeat(depth)
  if (Array.isArray(value)) {
    line(`${pad}${label}: array(${value.length})`)
    if (value.length) line(`${pad}  [0] keys: ${keys(value[0]).join(', ')}`)
  } else if (value && typeof value === 'object') {
    line(`${pad}${label}: object keys: ${keys(value).join(', ')}`)
  } else {
    line(`${pad}${label}: ${JSON.stringify(value)}`)
  }
}

/** Probe image URL candidates with HEAD; report what actually resolves. */
async function probeImages(candidates) {
  const results = []
  for (const c of candidates) {
    await sleep(120)
    let status = 0
    let type = ''
    try {
      const res = await fetch(c.url, { method: 'GET', headers: { 'User-Agent': UA } })
      status = res.status
      type = res.headers.get('content-type') || ''
      // drain so the socket closes
      await res.arrayBuffer().catch(() => {})
    } catch (err) {
      type = `network error: ${err.message}`
    }
    const ok = status === 200 && type.startsWith('image')
    results.push({ ...c, status, type, ok })
    line(`${ok ? '✓' : '✗'} [${status}] ${c.label.padEnd(26)} ${c.url}`)
  }
  return results
}

async function main() {
  await mkdir(OUT, { recursive: true })

  head('1. bootstrap-static')
  const boot = await get('bootstrap-static', `${API}/bootstrap-static`)
  if (!boot.ok) {
    line('bootstrap-static failed — everything else depends on it. Stopping.')
    process.exit(1)
  }
  line()
  line(`top-level keys: ${keys(boot.data).join(', ')}`)
  for (const k of keys(boot.data)) describe(k, boot.data[k], 1)

  const events = boot.data.events?.data ?? boot.data.events ?? []
  const elements = boot.data.elements?.data ?? boot.data.elements ?? []
  const teams = boot.data.teams?.data ?? boot.data.teams ?? []

  line()
  line(`events: ${events.length}   elements: ${elements.length}   teams: ${teams.length}`)

  if (events.length) {
    line()
    line('--- EVENT fields (question 4: is there a waiver/trade deadline?) ---')
    line(`event keys: ${keys(events[0]).join(', ')}`)
    const deadlineish = keys(events[0]).filter((k) => /deadline|waiver|trade|transaction|time|checked|finished/i.test(k))
    line(`deadline-ish keys: ${deadlineish.join(', ')}`)
    line()
    line('first 6 events, deadline-ish values:')
    for (const e of events.slice(0, 6)) {
      const bits = deadlineish.map((k) => `${k}=${JSON.stringify(e[k])}`).join('  ')
      line(`  GW${e.id}: ${bits}`)
    }
    const next = events.find((e) => !e.finished)
    line()
    line(`first unfinished event: ${next ? JSON.stringify(next, null, 2) : 'none — season over?'}`)
    const finished = events.filter((e) => e.finished)
    line(`finished events: ${finished.length ? finished.map((e) => e.id).join(', ') : 'none'}`)
    const checked = events.filter((e) => e.data_checked)
    line(`data_checked events: ${checked.length ? checked.map((e) => e.id).join(', ') : 'none'}`)
  }

  if (elements.length) {
    line()
    line('--- ELEMENT fields (question 6: photo reference) ---')
    line(`element keys: ${keys(elements[0]).join(', ')}`)
    const sample = elements.find((e) => e.total_points > 0) ?? elements[0]
    line(`sample element: ${JSON.stringify(sample, null, 2)}`)
  }
  if (teams.length) {
    line()
    line(`team keys: ${keys(teams[0]).join(', ')}`)
    line(`sample team: ${JSON.stringify(teams[0])}`)
  }

  head('2. game / event-status (current gameweek, waiver processing)')
  const game = await get('game', `${API}/game`)
  if (game.ok) line(JSON.stringify(game.data, null, 2).slice(0, 2000))
  const pl = await get('pl-event-status', `${API}/pl/event-status`)
  if (pl.ok) line(JSON.stringify(pl.data, null, 2).slice(0, 1500))

  head(`3. league/${LEAGUE_ID}/details`)
  const league = await get('league-details', `${API}/league/${LEAGUE_ID}/details`)
  let entries = []
  if (league.ok) {
    line()
    line(`top-level keys: ${keys(league.data).join(', ')}`)
    for (const k of keys(league.data)) describe(k, league.data[k], 1)
    entries = league.data.league_entries ?? []
    line()
    line('--- QUESTION 5: the eleven entries ---')
    if (entries.length) line(`league_entry keys: ${keys(entries[0]).join(', ')}`)
    for (const e of entries) {
      line(
        `  entry_id=${e.entry_id}  id=${e.id}  entry_name=${JSON.stringify(e.entry_name)}  ` +
          `name=${JSON.stringify(`${e.player_first_name ?? ''} ${e.player_last_name ?? ''}`.trim())}  ` +
          `short=${JSON.stringify(e.short_name)}  waiver_pick=${e.waiver_pick}`
      )
    }
    line()
    line('--- QUESTION 1: per-gameweek manager points, from standings ---')
    const standings = league.data.standings ?? []
    if (standings.length) {
      line(`standings keys: ${keys(standings[0]).join(', ')}`)
      for (const s of standings) line(`  ${JSON.stringify(s)}`)
    } else {
      line('standings empty (season not started?)')
    }
    line()
    line(`league object: ${JSON.stringify(league.data.league, null, 2)}`)
    if (league.data.matches) describe('matches', league.data.matches, 0)
  }

  head(`4. league/${LEAGUE_ID}/element-status  (QUESTION 2: ownership)`)
  const own = await get('element-status', `${API}/league/${LEAGUE_ID}/element-status`)
  if (own.ok) {
    line()
    line(`top-level keys: ${keys(own.data).join(', ')}`)
    for (const k of keys(own.data)) describe(k, own.data[k], 1)
    const list = own.data.element_status ?? []
    if (list.length) {
      line(`element_status[0]: ${JSON.stringify(list[0])}`)
      const byStatus = {}
      const byOwner = {}
      for (const r of list) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
        const o = r.owner ?? 'none'
        byOwner[o] = (byOwner[o] ?? 0) + 1
      }
      line(`counts by status: ${JSON.stringify(byStatus)}`)
      line(`counts by owner (owner id → players): ${JSON.stringify(byOwner)}`)
      line(`total rows: ${list.length}`)
    }
  }

  // Pick a gameweek worth inspecting: latest finished, else 1.
  const finishedEvents = events.filter((e) => e.finished)
  const probeGw = finishedEvents.length ? finishedEvents[finishedEvents.length - 1].id : 1
  const firstEntry = entries[0]

  head(`5. entry/{entry_id}/event/${probeGw}  (QUESTION 3: starters vs bench, auto-subs)`)
  if (firstEntry) {
    const picks = await get(
      `entry-${firstEntry.entry_id}-event-${probeGw}`,
      `${API}/entry/${firstEntry.entry_id}/event/${probeGw}`
    )
    if (picks.ok) {
      line()
      line(`for ${firstEntry.entry_name} (entry_id ${firstEntry.entry_id}), GW${probeGw}`)
      line(`top-level keys: ${keys(picks.data).join(', ')}`)
      for (const k of keys(picks.data)) describe(k, picks.data[k], 1)
      const ps = picks.data.picks ?? []
      if (ps.length) {
        line(`picks[0]: ${JSON.stringify(ps[0])}`)
        line(`all picks:`)
        for (const p of ps) line(`  ${JSON.stringify(p)}`)
      }
      if (picks.data.subs) {
        describe('subs', picks.data.subs, 0)
        line(`subs raw: ${JSON.stringify(picks.data.subs)}`)
      }
      if (picks.data.entry_history) line(`entry_history: ${JSON.stringify(picks.data.entry_history, null, 2)}`)
    }

    head(`6. entry/${firstEntry.entry_id}/history  (official per-GW totals?)`)
    const hist = await get(`entry-${firstEntry.entry_id}-history`, `${API}/entry/${firstEntry.entry_id}/history`)
    if (hist.ok) {
      line(`top-level keys: ${keys(hist.data).join(', ')}`)
      for (const k of keys(hist.data)) describe(k, hist.data[k], 1)
      line(JSON.stringify(hist.data, null, 2).slice(0, 3000))
    }

    head(`7. entry/${firstEntry.entry_id}/public`)
    const pub = await get(`entry-${firstEntry.entry_id}-public`, `${API}/entry/${firstEntry.entry_id}/public`)
    if (pub.ok) line(JSON.stringify(pub.data, null, 2).slice(0, 2000))
  } else {
    line('no league entries — skipping entry endpoints')
  }

  head(`8. event/${probeGw}/live`)
  const live = await get(`event-${probeGw}-live`, `${API}/event/${probeGw}/live`)
  if (live.ok) {
    line(`top-level keys: ${keys(live.data).join(', ')}`)
    const els = live.data.elements ?? {}
    const ids = Object.keys(els)
    line(`elements: ${Array.isArray(els) ? `array(${els.length})` : `object with ${ids.length} keys`}`)
    if (ids.length) {
      const k0 = ids[0]
      line(`elements["${k0}"] keys: ${keys(els[k0]).join(', ')}`)
      line(`elements["${k0}"]: ${JSON.stringify(els[k0], null, 2).slice(0, 1200)}`)
    }
    if (live.data.fixtures) describe('fixtures', live.data.fixtures, 0)
  }

  head(`9. league/${LEAGUE_ID}/transactions and /trades (do they exist?)`)
  await get('transactions', `${API}/draft/league/${LEAGUE_ID}/transactions`)
  await get('trades', `${API}/draft/${LEAGUE_ID}/trades`)
  await get('draft-choices', `${API}/draft/${LEAGUE_ID}/choices`)

  head('10. classic FPL bootstrap — the only source of `data_checked`')
  // The Draft events payload has no `data_checked`. The classic game does, and the
  // two share event ids and deadline_time, so we can cross-reference for the
  // "money is now final" signal.
  const classic = await get('classic-bootstrap', 'https://fantasy.premierleague.com/api/bootstrap-static/')
  if (classic.ok) {
    const ce = classic.data.events ?? []
    line(`classic event keys: ${keys(ce[0]).join(', ')}`)
    line(`has data_checked: ${Object.hasOwn(ce[0] ?? {}, 'data_checked')}`)
    const mismatch = ce.filter((c) => {
      const d = events.find((e) => e.id === c.id)
      return d && d.deadline_time !== c.deadline_time
    })
    line(`deadline_time mismatches between draft and classic: ${mismatch.length}`)
    line(`classic data_checked events: ${ce.filter((e) => e.data_checked).map((e) => e.id).join(', ') || 'none'}`)
  }

  head('11. deadlines by Europe/London month (drives the money calendar)')
  const monthOf = (iso) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' })
      .format(new Date(iso))
      .split('/')
      .reverse()
      .join('-')
  const perMonth = {}
  for (const e of events) {
    const m = monthOf(e.deadline_time)
    ;(perMonth[m] ??= []).push(e.id)
  }
  for (const [m, gws] of Object.entries(perMonth)) {
    line(`  ${m}: ${gws.length} GWs (${gws.join(', ')}) → pot if all charged £${gws.length * 5}`)
  }

  head('12. QUESTION 6 — image URL patterns')
  // NB: Draft elements have NO `photo` field (the classic API does). The photo
  // reference here is `code`, and the URL is p{code}.png.
  const player = elements.find((e) => e.total_points > 0) ?? elements[0]
  const team = teams.find((t) => t.code) ?? teams[0]
  line(`elements[0] has a "photo" field: ${Object.hasOwn(elements[0] ?? {}, 'photo')}`)
  line(`test player: ${player?.web_name} (id ${player?.id}, code ${player?.code})`)
  line(`test team:   ${team?.name} (id ${team?.id}, code ${team?.code})`)
  line()

  if (player) {
    const code = player.code
    line('--- player photo candidates ---')
    await probeImages([
      { label: 'pl/40x40 p{code}.png', url: `https://resources.premierleague.com/premierleague/photos/players/40x40/p${code}.png` },
      { label: 'pl/110x140 p{code}.png', url: `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png` },
      { label: 'pl/250x250 p{code}.png', url: `https://resources.premierleague.com/premierleague/photos/players/250x250/p${code}.png` },
      { label: 'pl25/250x250 p{code}.png', url: `https://resources.premierleague.com/premierleague25/photos/players/250x250/p${code}.png` },
      { label: 'pl26/250x250 p{code}.png', url: `https://resources.premierleague.com/premierleague26/photos/players/250x250/p${code}.png` },
      { label: 'missing code (fallback test)', url: `https://resources.premierleague.com/premierleague/photos/players/250x250/p999999.png` },
    ])
  }

  if (team) {
    const code = team.code
    line()
    line('--- club badge candidates ---')
    await probeImages([
      { label: 'pl/badges/20 t{code}.png', url: `https://resources.premierleague.com/premierleague/badges/20/t${code}.png` },
      { label: 'pl/badges/50 t{code}.png', url: `https://resources.premierleague.com/premierleague/badges/50/t${code}.png` },
      { label: 'pl/badges/50 t{code}@x2.png', url: `https://resources.premierleague.com/premierleague/badges/50/t${code}@x2.png` },
      { label: 'pl/badges/70 t{code}.png', url: `https://resources.premierleague.com/premierleague/badges/70/t${code}.png` },
      { label: 'pl/badges/100 t{code}.png', url: `https://resources.premierleague.com/premierleague/badges/100/t${code}.png` },
      { label: 'pl/badges t{code}.svg', url: `https://resources.premierleague.com/premierleague/badges/t${code}.svg` },
      { label: 'pl25/badges/50 t{code}.png', url: `https://resources.premierleague.com/premierleague25/badges/50/t${code}.png` },
    ])
  }

  head('done — raw samples in .api-samples/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
