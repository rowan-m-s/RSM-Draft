/**
 * Is a fixture actually in progress right now, per the data just fetched?
 *
 * Mirrors the app's own `matchState` (src/lib/fixtures.ts): live means
 * started and not finished, and `finishedProvisional` counts as finished —
 * FPL flags that the moment the final whistle goes, before `finished`
 * itself flips, and a provisionally-finished match is not one still worth
 * polling every minute for.
 *
 * Exits 0 while something is live, 1 once nothing is.
 */
import { readFile } from 'node:fs/promises'

const { matches } = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'))
const live = matches.some((m) => m.started && !m.finished && !m.finishedProvisional)

console.log(live ? 'Still live.' : 'Nothing live.')
process.exit(live ? 0 : 1)
