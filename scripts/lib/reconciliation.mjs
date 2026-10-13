/**
 * Our own gameweek finalisation (Addendum: own-gameweek-finalisation §4).
 *
 * "Not optional": once FPL finally confirms a gameweek we already acted on
 * ourselves — a Koch named, £5 charged, a reveal already run — this compares
 * what we decided against what FPL's own confirmation says, for all eleven
 * managers, and records whether they agree. If they don't, that is real
 * money sitting on the wrong person, and it has to be loud, not a log line.
 */

import { kochesOf } from '../../src/lib/season.ts'

function startersOf(squad) {
  return new Set((squad ?? []).filter((p) => p.starter).map((p) => p.element))
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

function totalFor(squad, elementPoints) {
  let sum = 0
  for (const element of startersOf(squad)) sum += elementPoints?.[element] ?? 0
  return sum
}

/**
 * Compare our locally-finalised snapshot of a gameweek against FPL's own
 * confirmation of the same week.
 *
 * @param managerKeys - every manager's key, so a manager missing from either
 *   side is still accounted for rather than silently skipped
 * @param ourSquads - our locked snapshot's squads: { key: [{element, starter}] }
 * @param ourElementPoints - the snapshot's own elementPoints, element -> points
 * @param fplSquads - FPL's confirmed squads, same shape, their own subs applied
 * @param fplScores - FPL's official per-manager totals (from /history, never
 *   sums from picks — the whole reason auto-subs matter in the first place)
 * @returns { event, perManager: { key: {...} }, ourKochKeys, fplKochKeys,
 *   kochMatch, reconciledAt }
 */
export function reconcile({ managerKeys, ourSquads, ourElementPoints, fplSquads, fplScores }) {
  const perManager = {}
  const ourTotals = {}
  const fplTotals = {}

  for (const key of managerKeys) {
    const ourXI = startersOf(ourSquads?.[key])
    const fplXI = startersOf(fplSquads?.[key])
    const xiMatch = sameSet(ourXI, fplXI)
    const ourTotal = totalFor(ourSquads?.[key], ourElementPoints)
    const fplTotal = fplScores?.[key] ?? 0
    const totalMatch = ourTotal === fplTotal

    ourTotals[key] = ourTotal
    fplTotals[key] = fplTotal

    perManager[key] = {
      xiMatch,
      ourTotal,
      fplTotal,
      totalMatch,
      totalDelta: ourTotal - fplTotal,
      // Same XI but a different total: the points themselves moved (a late
      // stat or bonus correction). A different XI: our substitution picked
      // someone FPL's own pass did not — that is where to look first.
      mismatchSource: xiMatch && totalMatch ? null : !xiMatch ? 'substitution' : 'points',
    }
  }

  const ourKochKeys = kochesOf(ourTotals).sort()
  const fplKochKeys = kochesOf(fplTotals).sort()

  return {
    perManager,
    ourKochKeys,
    fplKochKeys,
    kochMatch: sameSet(new Set(ourKochKeys), new Set(fplKochKeys)),
  }
}
