/**
 * Fail loudly if the league data has gone quiet mid-season.
 *
 *   node scripts/check-data-freshness.mjs
 *
 * fetch-data.mjs forces a rewrite every 2.5 hours regardless of real
 * change, purely so a quiet day never looks like a dead job. That promise
 * has broken silently twice now — found by eye both times, days apart —
 * so this checks it directly instead of trusting it: if gameweeks.json's
 * own `generatedAt` is more than a day old while the season is actually in
 * progress, something upstream of the heartbeat has stopped (the schedule
 * not firing, the fetch failing before it reaches the write step, or a
 * commit that never lands), and the run should go red rather than stay
 * quiet. Reads generatedAt rather than git history deliberately: the
 * checkout here is shallow, so "when was this file last committed" is not
 * reliably answerable from git log, but the file already timestamps itself.
 *
 * Run on every trigger, not just the ones that gate true — a quiet gate is
 * exactly the case a silently-dead schedule would also produce.
 */
import { readFile } from 'node:fs/promises'

const STALE_MS = 24 * 60 * 60 * 1000

const { gameweeks, generatedAt } = JSON.parse(await readFile('public/data/gameweeks.json', 'utf8'))

const inSeason = gameweeks.some((gw) => gw.finished) && gameweeks.some((gw) => !gw.finished)
if (!inSeason) {
  console.log('Not mid-season (no gameweek finished yet, or the season is already over) — guard not armed.')
  process.exit(0)
}

const ageMs = Date.now() - new Date(generatedAt).getTime()
const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1)

if (ageMs > STALE_MS) {
  console.error(
    `gameweeks.json was last generated ${ageHours}h ago, mid-season. The heartbeat should force a rewrite ` +
      `every 2.5 hours regardless of real change — this run has not seen one in over a day, which means ` +
      `something upstream of it has stopped: the schedule may not be firing, the fetch may be failing before ` +
      `it reaches the write step, or a commit may not be landing. Check the Actions history: ` +
      `https://github.com/rowan-m-s/RSM-Draft/actions/workflows/update-data.yml`
  )
  process.exit(1)
}

console.log(`gameweeks.json last generated ${ageHours}h ago — within the 24h guard.`)
