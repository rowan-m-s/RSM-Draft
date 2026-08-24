import { normaliseName } from '../images.shared.mjs'

/**
 * Graphics that vary by player: which of a manager's several images to show.
 *
 * Two halves, both pure. `resolvePlayerName` turns the name written in a
 * source filename into one FPL player from a list of candidates (the
 * manager's own squad, which removes almost all ambiguity). `pickGraphic`
 * chooses, from a manager's resolved graphics, the one for the player who
 * has scored most for that manager. Neither guesses: an unresolved or
 * ambiguous name is reported, and a pick with no eligible candidate is
 * null for the caller to fall back from and log.
 */

/**
 * Match a filename's player part against candidates on any of: web name,
 * surname, first name, first name + surname, and the last word of the
 * surname (FPL stores Portuguese and Brazilian surnames in full, so Bruno
 * Fernandes is "Borges Fernandes"), all normalised. Exactly one hit
 * resolves; none or several are returned as such. These are fixed forms,
 * not a similarity score: a misspelling is reported, never corrected.
 */
export function resolvePlayerName({ name, candidates }) {
  const wanted = normaliseName(name)
  const hits = candidates.filter((p) => {
    const lastSurname = (p.secondName ?? '').trim().split(/\s+/).at(-1)
    const forms = new Set(
      [p.webName, p.secondName, p.firstName, `${p.firstName ?? ''}${p.secondName ?? ''}`, lastSurname]
        .filter(Boolean)
        .map(normaliseName)
    )
    return forms.has(wanted)
  })
  if (hits.length === 1) return { status: 'resolved', player: hits[0] }
  if (hits.length === 0) return { status: 'unresolved' }
  return { status: 'ambiguous', players: hits }
}

/**
 * The graphic to show: the candidate with the most points scored for this
 * manager, among those the manager still owns.
 *
 * Ties, including the all-zero start of the season, go to the alphabetically
 * first normalised surname, so the choice is the same on every build and
 * never random. Returns null when no candidate is owned; the caller falls
 * back and says so.
 */
export function pickGraphic({ candidates, pointsByCode = {}, ownedCodes }) {
  const eligible = candidates.filter((c) => ownedCodes.has(c.code))
  if (eligible.length === 0) return null
  const sorted = [...eligible].sort((a, b) => {
    const diff = (pointsByCode[b.code] ?? 0) - (pointsByCode[a.code] ?? 0)
    if (diff !== 0) return diff
    return normaliseName(a.surname).localeCompare(normaliseName(b.surname))
  })
  return { code: sorted[0].code, points: pointsByCode[sorted[0].code] ?? 0 }
}
