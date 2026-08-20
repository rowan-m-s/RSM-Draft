#!/usr/bin/env node
/**
 * Work out which player-photo and club-badge URL pattern is current.
 *
 *   node scripts/probe-photos.mjs
 *
 * FPL scopes player photos to a season. The catch is that an out-of-date path
 * keeps returning 200 — it serves whatever was there when it was last
 * populated — so a player who changed club shows up in his old kit and nothing
 * ever errors. A status code cannot tell you the picture is current; only
 * looking at it can.
 *
 * So this prints every combination that returns an image, and the winners then
 * have to be opened and checked by eye. The test set deliberately includes
 * players who moved between Premier League clubs in the last window, because
 * they are the ones a stale path exposes.
 */

import { setTimeout as sleep } from 'node:timers/promises'

const UA = 'RSM-Draft-Tracker/1.0 (https://github.com/rowan-m-s/RSM-Draft)'
const HOST = 'https://resources.premierleague.com'

/**
 * Chosen by `code`, not by name — "Sangaré" matches two different players in
 * the same payload and a name lookup silently picks the wrong one.
 */
const PLAYERS = [
  { name: 'Calvert-Lewin', code: 177815, club: 'LEE', moved: 'Everton → Leeds' },
  { name: 'Van Hecke', code: 469142, club: 'TOT', moved: 'Brighton → Tottenham' },
  { name: 'Mbeumo', code: 446008, club: 'MUN', moved: 'Brentford → Man Utd' },
  { name: 'Šeško', code: 485711, club: 'MUN', moved: 'Leipzig → Man Utd' },
  { name: 'Wirtz', code: 494595, club: 'LIV', moved: 'Leverkusen → Liverpool' },
  { name: 'Haaland', code: 223094, club: 'MCI', moved: 'no move — control' },
]

const CLUBS = [
  { name: 'Leeds', code: 2 },
  { name: 'Man Utd', code: 1 },
  { name: 'Sunderland', code: 56 },
]

/**
 * The season segment is the suspect. `premierleague` is unversioned and is
 * what the site currently uses; the numbered ones follow FPL's own convention.
 */
const SEASONS = ['premierleague', 'premierleague25', 'premierleague26', 'premierleague27']
const SIZES = ['40x40', '110x140', '250x250']
/** `photo` and `code` are the same number, so only the prefix really varies. */
const NAMING = [
  { label: 'p{code}', build: (code) => `p${code}.png` },
  { label: '{code}', build: (code) => `${code}.png` },
]

async function probe(url) {
  await sleep(80)
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
    const buffer = await response.arrayBuffer().catch(() => new ArrayBuffer(0))
    return {
      status: response.status,
      type: response.headers.get('content-type') ?? '',
      bytes: buffer.byteLength,
      modified: response.headers.get('last-modified') ?? '',
    }
  } catch (error) {
    return { status: 0, type: `error: ${error.message}`, bytes: 0, modified: '' }
  }
}

const isImage = (r) => r.status === 200 && r.type.startsWith('image') && r.bytes > 0

async function main() {
  console.log('=== PLAYER PHOTOS ===\n')
  const combos = []
  for (const season of SEASONS) {
    for (const size of SIZES) {
      for (const naming of NAMING) {
        combos.push({ season, size, naming })
      }
    }
  }

  // One cheap probe per combination first, so the full sweep only runs on
  // patterns that resolve at all.
  const live = []
  for (const combo of combos) {
    const url = `${HOST}/${combo.season}/photos/players/${combo.size}/${combo.naming.build(PLAYERS[0].code)}`
    const result = await probe(url)
    const label = `${combo.season}/${combo.size}/${combo.naming.label}`
    console.log(`${isImage(result) ? '✓' : '✗'} [${String(result.status).padEnd(3)}] ${label.padEnd(44)} ${result.bytes} bytes`)
    if (isImage(result)) live.push(combo)
  }

  if (live.length === 0) {
    console.log('\nNothing resolved. The host or path has changed more than expected.')
    return
  }

  console.log(`\n${live.length} pattern(s) resolve. Checking every test player against each:\n`)
  const table = []
  for (const combo of live) {
    const row = { pattern: `${combo.season}/${combo.size}/${combo.naming.label}` }
    for (const player of PLAYERS) {
      const url = `${HOST}/${combo.season}/photos/players/${combo.size}/${combo.naming.build(player.code)}`
      const result = await probe(url)
      row[player.name] = isImage(result) ? `${(result.bytes / 1024).toFixed(0)}KB` : `✗ ${result.status}`
    }
    table.push(row)
  }
  console.table(table)

  console.log('\nURLs to open and check BY EYE — a 200 does not mean the photo is current:\n')
  for (const combo of live) {
    console.log(`  ${combo.season}/${combo.size}/${combo.naming.label}`)
    for (const player of PLAYERS) {
      console.log(
        `    ${player.name.padEnd(15)} ${player.moved.padEnd(26)} ` +
          `${HOST}/${combo.season}/photos/players/${combo.size}/${combo.naming.build(player.code)}`
      )
    }
    console.log()
  }

  console.log('=== CLUB BADGES ===\n')
  const badgeCombos = []
  for (const season of SEASONS) {
    for (const size of ['20', '50', '70', '100']) {
      badgeCombos.push({ season, size })
    }
  }
  for (const combo of badgeCombos) {
    const url = `${HOST}/${combo.season}/badges/${combo.size}/t${CLUBS[0].code}.png`
    const result = await probe(url)
    const label = `${combo.season}/badges/${combo.size}`
    console.log(`${isImage(result) ? '✓' : '✗'} [${String(result.status).padEnd(3)}] ${label.padEnd(44)} ${result.bytes} bytes`)
  }
  console.log()
  for (const club of CLUBS) {
    console.log(`  ${club.name.padEnd(12)} ${HOST}/premierleague/badges/50/t${club.code}.png`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
