/**
 * Our own auto-substitution engine (Addendum: own-gameweek-finalisation §1).
 *
 * FPL applies this only once a gameweek is confirmed, which this season can
 * slip well past the working day everyone wants a Koch by. This reproduces
 * the same computation independently, from the manager's *original*
 * pre-deadline fifteen, so it never has to wait on FPL's own timing.
 *
 * Rules, exactly as specified:
 *   - A starter is eligible if they played zero minutes. Not "scored
 *     nothing" — zero minutes only. A starter who played and blanked stays.
 *   - Bench order is fixed: outfield bench tried 1, then 2, then 3. The
 *     bench goalkeeper only ever replaces the starting goalkeeper.
 *   - A substitution only happens if the resulting XI is legal: exactly 1
 *     GKP, at least 3 DEF, 2 MID, 1 FWD (and never over the squad's own
 *     per-position maximums — a legal XI both ways).
 *   - If a bench player would break the formation, skip them and try the
 *     next; if none work, the zero-minute starter is left in place.
 *   - The formation is free to change shape; nothing is preserved.
 *   - Every eligible starter is processed, in their original pick order,
 *     against the bench queue as it stands after earlier substitutions in
 *     this same pass — a bench player tried and rejected for one starter
 *     remains available for the next; one who comes on is used up.
 */

const POSITIONS = { GKP: 'GKP', DEF: 'DEF', MID: 'MID', FWD: 'FWD' }

const MIN = { DEF: 3, MID: 2, FWD: 1 }
const MAX = { GKP: 1, DEF: 5, MID: 5, FWD: 3 }

/** Whether a set of positions (one per outfield+GK slot) is a legal XI. */
function isLegalFormation(positionCounts) {
  if ((positionCounts.GKP ?? 0) !== 1) return false
  for (const pos of ['DEF', 'MID', 'FWD']) {
    const n = positionCounts[pos] ?? 0
    if (n < MIN[pos] || n > MAX[pos]) return false
  }
  const total = Object.values(positionCounts).reduce((a, b) => a + b, 0)
  return total === 11
}

function countPositions(elements, positionOf) {
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const el of elements) counts[positionOf(el)] = (counts[positionOf(el)] ?? 0) + 1
  return counts
}

/**
 * Apply the substitution rules to one manager's original fifteen.
 *
 * @param picks - the manager's pre-deadline selection: [{ element, position
 *   (1-15, 1-11 original starters, 12-15 original bench in priority order) }]
 * @param positionOf - element id -> 'GKP' | 'DEF' | 'MID' | 'FWD'
 * @param minutesOf - element id -> minutes played that gameweek
 * @returns { element, originalStarter, starter, subbedOn, subbedOff }[] —
 *   the full fifteen, with `starter` reflecting our computed result.
 */
export function applySubstitutions({ picks, positionOf, minutesOf }) {
  const starters = picks.filter((p) => p.position >= 1 && p.position <= 11).sort((a, b) => a.position - b.position)
  const bench = picks.filter((p) => p.position >= 12 && p.position <= 15).sort((a, b) => a.position - b.position)

  const xi = new Set(starters.map((p) => p.element))
  const subbedOn = new Set()
  const subbedOff = new Set()
  const benchUsed = new Set()

  const played = (element) => (minutesOf(element) ?? 0) > 0

  for (const starter of starters) {
    if (played(starter.element)) continue // not eligible: they played

    const startedAsGk = positionOf(starter.element) === 'GKP'
    const candidates = bench
      .filter((b) => !benchUsed.has(b.element))
      .filter((b) => (positionOf(b.element) === 'GKP') === startedAsGk) // GK only replaces GK, never the reverse
      .filter((b) => played(b.element)) // a bench player who didn't play can't come on either

    for (const candidate of candidates) {
      if (startedAsGk) {
        // Swapping one keeper for the other never changes outfield shape.
        xi.delete(starter.element)
        xi.add(candidate.element)
        benchUsed.add(candidate.element)
        subbedOff.add(starter.element)
        subbedOn.add(candidate.element)
        break
      }
      const trial = new Set(xi)
      trial.delete(starter.element)
      trial.add(candidate.element)
      if (isLegalFormation(countPositions(trial, positionOf))) {
        xi.delete(starter.element)
        xi.add(candidate.element)
        benchUsed.add(candidate.element)
        subbedOff.add(starter.element)
        subbedOn.add(candidate.element)
        break
      }
      // Illegal: leave this candidate available and try the next bench slot.
    }
    // No legal candidate found among the remaining bench: the zero stands.
  }

  return [...starters, ...bench].map((p) => ({
    element: p.element,
    originalStarter: p.position <= 11,
    starter: xi.has(p.element),
    subbedOn: subbedOn.has(p.element),
    subbedOff: subbedOff.has(p.element),
  }))
}
