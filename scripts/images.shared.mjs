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

export const ALL_SETS = [...MANAGER_SETS, ...SEASON_SETS]

export const SOURCE_DIR = 'assets-src'
export const OUT_DIR = 'public/images'

/** Formats we emit for every image: webp first, jpg as the fallback. */
export const FORMATS = ['webp', 'jpg']

/**
 * Files in `assets-src/` that are not manager assets but belong there anyway.
 * Naming them means they are reported as expected rather than as strays, which
 * keeps the "skipped" list meaningful.
 */
export const KNOWN_OTHER_FILES = new Map([
  ['premierleaguelogo.png', 'the Premier League lockup used on the banners'],
  ['img_2093.jpg', 'reference screenshot — official FPL pitch view'],
  ['img_2094.jpg', 'reference screenshot — third-party pitch view'],
])

/** Files the OS drops in that are never worth mentioning. */
const NOISE = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

/**
 * Match on key and type only, accepting any image extension.
 *
 * The source set is genuinely inconsistent: icons arrived as `.jpg` while the
 * cards are `.png`, and capitalisation varies (`DJ.winner.png`,
 * `Rushy.Winner.png`). Matching the extension strictly would report all eleven
 * icons as missing. The optimiser converts everything to webp regardless, so
 * the source format matters only for finding the file.
 */
export function parseSourceName(filename) {
  const match = filename.match(
    new RegExp(`^(.+?)\\.(${ALL_SETS.join('|')})\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i')
  )
  if (!match) return null
  return { key: match[1].toLowerCase(), set: match[2].toLowerCase(), ext: match[3].toLowerCase() }
}

/** Levenshtein, capped — only used to suggest a correction on a typo. */
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return rows[a.length][b.length]
}

function nearestKey(key) {
  let best = null
  let bestDistance = Infinity
  for (const candidate of MANAGER_KEYS) {
    const distance = editDistance(key, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  // Only suggest something genuinely close, or the hint is noise.
  return bestDistance <= 2 ? best : null
}

/**
 * Decide what a file in `assets-src/` is.
 *
 * Everything that is not a manager asset gets a reason, and the caller prints
 * it. Silently ignoring unmatched files makes a typo look exactly like a
 * deliberate exclusion — which is the one case where you need to be told.
 *
 *   asset        a real manager image, ready to optimise
 *   known-other  expected, not a manager image
 *   unknown-key  parses as an asset but the key is not one of the eleven.
 *                Almost always a typo, so this is an error rather than a skip.
 *   ignored      not an image asset at all
 *   noise        OS clutter, not worth reporting
 */
export function classifySourceFile(filename) {
  const lower = filename.toLowerCase()

  if (NOISE.has(lower)) return { status: 'noise', filename }

  if (KNOWN_OTHER_FILES.has(lower)) {
    return { status: 'known-other', filename, reason: KNOWN_OTHER_FILES.get(lower) }
  }

  const parsed = parseSourceName(filename)
  if (!parsed) {
    return {
      status: 'ignored',
      filename,
      reason: `does not match {key}.{${ALL_SETS.join('|')}}.{${IMAGE_EXTENSIONS.join('|')}}`,
    }
  }

  if (!MANAGER_KEYS.includes(parsed.key)) {
    const suggestion = nearestKey(parsed.key)
    return {
      status: 'unknown-key',
      filename,
      ...parsed,
      reason:
        `parses as a "${parsed.set}" image but "${parsed.key}" is not one of the eleven keys` +
        (suggestion ? `. Did you mean "${suggestion}"?` : ''),
    }
  }

  return { status: 'asset', filename, ...parsed }
}
