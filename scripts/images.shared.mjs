/** Shared vocabulary for the image scripts. */

export const MANAGER_KEYS = [
  'rushy',
  'kellett',
  'wallis',
  'jls',
  'paddy',
  'bennett',
  'wood',
  'rowan',
  'jason',
  'dj',
  'ollie',
]

/** The three sets that must be complete: 11 keys × 3 = 33 files. */
export const MANAGER_SETS = ['icon', 'koch', 'motm']

/**
 * `winner` is deliberately not in that list. It holds one image per past
 * season, not one per manager, so it is validated against honours.json
 * instead — nine managers having no winner image is expected, not a fault.
 */
export const SEASON_SETS = ['winner']

export const SOURCE_DIR = 'assets-src'
export const OUT_DIR = 'public/images'

/** Formats we emit for every image: webp first, jpg as the fallback. */
export const FORMATS = ['webp', 'jpg']

/**
 * Source files are named `{name}.{type}.{ext}` with inconsistent capitalisation
 * and a mix of png and jpg (`kellett.icon.jpg`, `DJ.winner.png`,
 * `Rushy.Winner.png`). Everything normalises to a lowercase key.
 */
export function parseSourceName(filename) {
  const match = filename.match(/^(.+?)\.(icon|koch|motm|winner)\.(png|jpe?g|webp)$/i)
  if (!match) return null
  return { key: match[1].toLowerCase(), set: match[2].toLowerCase(), ext: match[3].toLowerCase() }
}
