/**
 * Is there a fixture kicking off soon, in progress, or just finished?
 *
 * Reads the already-published fixtures list — no network call — so a
 * matchday cron can check this in under a second and skip entirely on a
 * day with nothing scheduled, rather than running a full fetch to find out
 * nothing has changed. The window is generous: 10 minutes before kickoff
 * (so the first live match of the window is never missed) to 160 minutes
 * after (90 minutes plus stoppage, half-time and a margin for a delayed
 * finish, mirroring the cushions used elsewhere for FPL's own lag).
 *
 * Exits 0 when worth running, 1 otherwise.
 */
import { readFile } from 'node:fs/promises'

const BEFORE_MS = 10 * 60 * 1000
const AFTER_MS = 160 * 60 * 1000

const { matches } = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'))
const now = Date.now()

const inWindow = matches.some((m) => {
  if (!m.kickoff) return false
  const kickoff = new Date(m.kickoff).getTime()
  return now >= kickoff - BEFORE_MS && now <= kickoff + AFTER_MS
})

if (inWindow) {
  console.log('A fixture is near its kickoff window.')
  process.exit(0)
}
console.log('No fixture is near kickoff right now.')
process.exit(1)
