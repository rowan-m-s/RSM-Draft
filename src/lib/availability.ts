/**
 * FPL's injury and availability flags.
 *
 * Status codes verified against the live Draft bootstrap on 20 August 2026 —
 * Draft carries the same fields as the classic game, which was worth checking
 * rather than assuming:
 *
 *   a  available    never carries news
 *   d  doubtful     a knock, illness or partial chance — 25/50/75%
 *   i  injured      chance 0
 *   s  suspended    chance 0
 *   u  unavailable  chance 0, mostly players who have left the league
 *
 * Red covers injured, suspended and unavailable; yellow is doubtful only.
 * Every non-available player had news text and no available player did, so the
 * reason can always be shown — and the reason is more use than the colour.
 */

export type AvailabilityStatus = 'a' | 'd' | 'i' | 's' | 'u'

export interface Availability {
  status: string
  chanceOfPlaying: number | null
  news: string | null
  newsAdded: string | null
}

export type FlagColour = 'none' | 'yellow' | 'red'

const RED: ReadonlySet<string> = new Set(['i', 's', 'u'])

export function flagColour(status: string | undefined): FlagColour {
  if (status === 'd') return 'yellow'
  if (status && RED.has(status)) return 'red'
  return 'none'
}

const LABELS: Record<string, string> = {
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
}

export function flagLabel(status: string | undefined): string | null {
  return status ? (LABELS[status] ?? null) : null
}

/**
 * What to show when someone taps the flag. The news text already reads as a
 * sentence ("Calf injury - 75% chance of playing"), so the percentage is only
 * added when FPL has not put it there itself.
 */
export function availabilityText(player: Availability): string | null {
  const label = flagLabel(player.status)
  if (!label) return null

  // The percentage is only worth adding when it says something the heading
  // does not. "Injured — 0% chance of playing" is noise; the heading already
  // said injured. FPL also often puts the number in the news text itself.
  const chance = player.chanceOfPlaying
  const worthAdding = chance !== null && chance > 0 && !(player.news && /\d+%/.test(player.news))

  if (!player.news) return worthAdding ? `${label}, ${chance}% chance of playing` : label
  return worthAdding ? `${player.news}. ${chance}% chance of playing` : player.news
}
