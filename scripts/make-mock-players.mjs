#!/usr/bin/env node
/**
 * Phase 2 scaffolding only. Builds src/mock/players.json from a real
 * bootstrap-static sample so the design pass uses genuine names, clubs and
 * photo codes — a mock players table full of invented names tells you nothing
 * about whether real ones overflow the column.
 *
 * Phase 4 deletes this and the file it writes.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'

const KEYS = ['rushy', 'kellett', 'wallis', 'jls', 'paddy', 'bennett', 'wood', 'rowan', 'jason', 'dj', 'ollie']
const POSITIONS = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' }

const boot = JSON.parse(await readFile('.api-samples/bootstrap-static.json', 'utf8'))
const teams = new Map(boot.teams.map((t) => [t.id, t]))

const all = boot.elements
  .map((e) => {
    const team = teams.get(e.team)
    return {
      id: e.id,
      name: e.web_name,
      position: POSITIONS[e.element_type],
      club: team.name,
      clubShort: team.short_name,
      clubCode: team.code,
      photoCode: e.code,
      owner: null,
      points: e.total_points,
      ppg: Number(e.points_per_game),
      goals: e.goals_scored,
      assists: e.assists,
      cleanSheets: e.clean_sheets,
      bonus: e.bonus,
      draftRank: e.draft_rank ?? 9999,
      positionRank: 0,
    }
  })
  .sort((a, b) => a.draftRank - b.draftRank)

/**
 * Snake draft over the top 165: 11 managers × 15 rounds. Gives owners that
 * look like a real draft — the strong squads at the wheel ends, not a
 * round-robin where manager 1 gets every best pick.
 */
const squads = Object.fromEntries(KEYS.map((k) => [k, []]))
let pick = 0
for (let round = 0; round < 15; round++) {
  const order = round % 2 === 0 ? KEYS : [...KEYS].reverse()
  for (const key of order) {
    const player = all[pick++]
    if (!player) break
    player.owner = key
    squads[key].push(player)
  }
}

// Rank within position by points, across everyone. FPL Draft has no prices, so
// this is the only "how good is this player" number we can honestly show.
for (const position of Object.values(POSITIONS)) {
  all
    .filter((p) => p.position === position)
    .sort((a, b) => b.points - a.points)
    .forEach((p, i) => (p.positionRank = i + 1))
}

const strip = ({ draftRank, ...rest }) => rest
const byPoints = (a, b) => b.points - a.points
const owned = all
  .filter((p) => p.owner)
  .map(strip)
  .sort(byPoints)
// Keep the mock free-agent pool to a realistic-looking slice rather than all
// 430 — the file is committed and nobody needs 430 rows to judge a layout.
const freeAgents = all
  .filter((p) => !p.owner)
  .sort(byPoints)
  .slice(0, 120)
  .map(strip)

await mkdir('src/mock', { recursive: true })
await writeFile(
  'src/mock/players.json',
  JSON.stringify(
    {
      owned,
      freeAgents,
      leadingScorer: owned[0] ?? null,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  ) + '\n'
)

console.log(`owned ${owned.length}, free agents ${freeAgents.length}`)
console.log(`leading scorer: ${owned[0].name} (${owned[0].club}) ${owned[0].points} pts, owned by ${owned[0].owner}`)
for (const key of KEYS) {
  const squad = squads[key]
  console.log(`  ${key.padEnd(8)} ${squad.length} players, ${squad.reduce((s, p) => s + p.points, 0)} pts`)
}
