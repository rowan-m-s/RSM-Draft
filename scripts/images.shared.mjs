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

/**
 * The sets that must hold exactly one image per manager: 11 keys × 4 = 44
 * files. `koch2` is a second Koch graphic, shown on a manager's second
 * Koch of the season and every other one after that, so a repeat offender
 * does not see the same card twice running.
 */
export const MANAGER_SETS = ['icon', 'koch', 'koch2', 'motm']

/**
 * Sets with several images per manager, one per player, named
 * `{manager}.{set}.{player}.png` and written keyed by the player's FPL code.
 * Validated by rule rather than by count: every manager has at least one,
 * every name resolves to exactly one owned player, every resolved code has
 * a file. Only `leader` today; koch and motm could move to this later.
 */
export const PLAYER_SETS = ['leader']

/**
 * Source filenames that are a known misspelling of a key. Mapped rather than
 * rejected, and the optimiser logs every time it applies one, so the
 * correction is visible rather than silent.
 */
export const KEY_ALIASES = new Map([['kellet', 'kellett']])

/**
 * Source name patterns that are deliberately not processed yet. Each is
 * reported as skipped with its reason rather than as an unknown file.
 */
export const HELD_SETS = new Map()

/**
 * `winner` is deliberately not in that list. It holds one image per past
 * season, not one per manager, so it is validated against honours.json
 * instead — nine managers having no winner image is expected, not a fault.
 */
export const SEASON_SETS = ['winner']

export const ALL_SETS = [...MANAGER_SETS, ...SEASON_SETS, ...PLAYER_SETS]

/**
 * Normalise a name for matching: strip diacritics, drop apostrophes,
 * underscores, hyphens, dots and spaces, lowercase. Both the filename and the
 * FPL names go through this, so `O_Reilly`, `Gyokeres` and `JoãoPedro` meet
 * their players.
 */
export function normaliseName(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s'’_\-.]/g, '')
    .toLowerCase()
}

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
  const player = filename.match(
    new RegExp(`^(.+?)\\.(${PLAYER_SETS.join('|')})\\.(.+?)\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i')
  )
  if (player) {
    const raw = player[1].toLowerCase()
    const key = KEY_ALIASES.get(raw) ?? raw
    return {
      key,
      set: player[2].toLowerCase(),
      player: player[3],
      ext: player[4].toLowerCase(),
      ...(key !== raw ? { aliasOf: raw } : {}),
    }
  }
  const match = filename.match(
    new RegExp(`^(.+?)\\.(${ALL_SETS.join('|')})\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i')
  )
  if (!match) return null
  const raw = match[1].toLowerCase()
  const key = KEY_ALIASES.get(raw) ?? raw
  const set = match[2].toLowerCase()
  // A player set needs its third part; a two-part name is a mistake, not a default.
  if (PLAYER_SETS.includes(set)) return null
  return { key, set, ext: match[3].toLowerCase(), ...(key !== raw ? { aliasOf: raw } : {}) }
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

  const held = filename.match(new RegExp(`^(.+?)\\.(${[...HELD_SETS.keys()].join('|')})\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i'))
  if (held) {
    return { status: 'held', filename, set: held[2].toLowerCase(), reason: HELD_SETS.get(held[2].toLowerCase()) }
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

/**
 * The fallbacks for a player with no photo and a club with no badge, as the
 * optimiser writes them to public/images. Drawn in white at the theme's
 * token alphas, 10% for the ground and 35% for the figure, matching
 * --color-pl-border and --color-pl-muted, so they sit on any aubergine
 * surface and on the pitch. An SVG loaded through <img> cannot read CSS
 * variables, which is why the alphas are written out here; keep them in
 * step with index.css. images.shared.test.mjs pins both.
 */
export const PLAYER_SILHOUETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="No photo" fill="white">
  <rect width="100" height="100" fill-opacity=".1"/>
  <circle cx="50" cy="38" r="17" fill-opacity=".35"/>
  <path d="M16 100c0-19 15-31 34-31s34 12 34 31z" fill-opacity=".35"/>
</svg>
`

export const BADGE_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="No badge">
  <path d="M50 6 88 20v34c0 22-16 34-38 40C28 88 12 76 12 54V20z" fill="white" fill-opacity=".1" stroke="white" stroke-opacity=".35" stroke-width="4"/>
</svg>
`
