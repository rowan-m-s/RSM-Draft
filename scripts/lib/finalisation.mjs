/**
 * Our own gameweek finalisation (Addendum: own-gameweek-finalisation §2).
 *
 * FPL's own confirmation has been slipping well past the working day this
 * season — a gameweek can still be unconfirmed days after its last match.
 * `locallyFinalised` computes the same "is this gameweek actually done"
 * question independently, from signals already present in the data we
 * already poll, so nothing downstream has to wait on FPL's own timing.
 *
 * A gameweek is locally finalised once:
 *
 *   1. Every one of its fixtures has finished. "Finished" means
 *      `finished || finishedProvisional` — the practical, no-more-events
 *      signal — not the strict `finished` flag alone, which lags for the
 *      same reason FPL's own confirmation does, and would just reintroduce
 *      the exact problem this exists to solve.
 *
 *   2. Bonus points have been posted for every one of those fixtures,
 *      checked against *every* element in the live payload, not just the
 *      players our eleven managers own. A fixture whose three bonus
 *      recipients are all undrafted players would otherwise look like
 *      bonus was never awarded, for as long as the gameweek runs — this is
 *      not a hypothetical: GW5's own confirmed data has exactly this case
 *      (fixture 41, no owned player got any bonus that week).
 *
 *   3. At least `bufferMs` (a config value, default two hours) have passed
 *      since the last fixture's final whistle. FPL's data carries no
 *      "finished at" timestamp, so the whistle is estimated as kickoff +
 *      `ASSUMED_MATCH_DURATION_MS`, deliberately biased long. Getting that
 *      estimate wrong by a few minutes only shifts when the buffer starts
 *      counting — it can never bypass condition 1, which is the real
 *      "did it actually end" gate.
 */

/** 90 regulation + 15 half-time + a generous stoppage allowance, biased long. */
export const ASSUMED_MATCH_DURATION_MS = 130 * 60 * 1000

/** The buffer itself: a config value, not folded into the estimate above. */
export const DEFAULT_FINALISATION_BUFFER_MS = 2 * 60 * 60 * 1000

function fixtureHasFinished(fixture) {
  return Boolean(fixture.finished) || Boolean(fixture.finishedProvisional)
}

/**
 * Fixture ids with no bonus posted for anyone yet, from the full,
 * ownership-unfiltered live payload.
 */
export function fixturesMissingBonus(livePayload, fixtureIds) {
  const wanted = new Set(fixtureIds)
  const posted = new Set()
  for (const entry of Object.values(livePayload?.elements ?? {})) {
    const explain = entry?.explain
    if (!Array.isArray(explain)) continue
    for (const item of explain) {
      const [components, fixtureId] = Array.isArray(item) ? item : [item?.stats, item?.fixture]
      if (!Array.isArray(components) || fixtureId == null || !wanted.has(fixtureId)) continue
      if (components.some((c) => String(c.stat ?? c.identifier ?? '') === 'bonus')) posted.add(fixtureId)
    }
  }
  return fixtureIds.filter((id) => !posted.has(id))
}

/**
 * @param fixtures - this gameweek's fixtures: [{ id, kickoff, finished, finishedProvisional }]
 * @param livePayload - the Draft `/event/{n}/live` payload, unfiltered
 * @param now - ms since epoch
 * @param bufferMs - §2's config value; defaults to two hours
 * @returns { finalised: boolean, reason?: string, readyAt?: string }
 */
export function isLocallyFinalised({ fixtures, livePayload, now, bufferMs = DEFAULT_FINALISATION_BUFFER_MS }) {
  if (fixtures.length === 0) return { finalised: false, reason: 'no fixtures this gameweek' }

  const unfinished = fixtures.filter((f) => !fixtureHasFinished(f))
  if (unfinished.length > 0) {
    return {
      finalised: false,
      reason: `${unfinished.length} fixture(s) not finished: ${unfinished.map((f) => f.id).join(', ')}`,
    }
  }

  const missingBonus = fixturesMissingBonus(livePayload, fixtures.map((f) => f.id))
  if (missingBonus.length > 0) {
    return { finalised: false, reason: `bonus not yet posted for fixture(s) ${missingBonus.join(', ')}` }
  }

  const lastKickoff = Math.max(...fixtures.map((f) => new Date(f.kickoff).getTime()))
  const readyAt = lastKickoff + ASSUMED_MATCH_DURATION_MS + bufferMs
  if (now < readyAt) {
    return { finalised: false, reason: 'finalisation buffer not yet elapsed', readyAt: new Date(readyAt).toISOString() }
  }

  return { finalised: true }
}
