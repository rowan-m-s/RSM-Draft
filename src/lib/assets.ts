/**
 * URL builders for images.
 *
 * Manager images are ours and are served from the site. Player photos and club
 * badges are hotlinked from Premier League resources — nearly 600 players is
 * far too many files to commit, and `<img src>` is unaffected by CORS. That
 * restriction only applies to `fetch`, which is why the *data* needs a
 * server-side job but the pictures do not.
 *
 * Verified in Phase 1, including from a third-party origin so that a Referer
 * check would have shown up: these load, and a player with no photo yet
 * answers 403, which still fires `onerror`.
 */

const RESOURCES = 'https://resources.premierleague.com'

/**
 * ── PLAYER PHOTO PATH ──────────────────────────────────────────────────────
 *
 * Verified by eye on 20 August 2026. If photos start showing players in old
 * kits again, this constant is the thing to change — nothing else.
 *
 * FPL scopes player photos to a season folder. The trap is that a stale folder
 * keeps answering 200 with last season's picture, so nothing 404s and nothing
 * errors; a player who moved clubs simply appears in his old shirt forever.
 * `scripts/probe-photos.mjs` sweeps the combinations and prints URLs to check
 * by eye, because a status code cannot tell you a photo is current.
 *
 * What that sweep found:
 *
 *   premierleague/photos/players/{size}/p{code}.png    ← the OLD path. Serves
 *       last season's kits: Calvert-Lewin at Everton, Van Hecke at Brighton,
 *       Mbeumo at Brentford. Players new to the league — Wirtz, Šeško — 403.
 *
 *   premierleague25/photos/players/{size}/{code}.png   ← CURRENT. Same players
 *       in Leeds, Spurs and Man Utd kits, and the new arrivals present.
 *
 * Note the two differences: the season segment, and the filename has no `p`
 * prefix. Both changed at once, which is why the old path kept working.
 *
 * Sizes that exist here are 40x40, 110x140 and 500x500. There is no 250x250 —
 * that was an old-path size. Files are served at roughly 2× the name.
 *
 * Coverage is not total: 173 of 595 players have no photo, 23 of them owned in
 * this league. Those fall back to the silhouette rather than to the old path,
 * deliberately — the players missing a current photo are overwhelmingly the
 * ones who just transferred, so the old path would show precisely the wrong
 * kit for precisely the players most likely to be looked up.
 */
const PHOTO_SEASON = 'premierleague25'

/**
 * ── CLUB BADGE PATH ────────────────────────────────────────────────────────
 *
 * Badges are NOT season-scoped: premierleague25/badges/* returns 403 for every
 * size. The unversioned path is the only one that exists, and all 20 of this
 * season's clubs resolve on it, including the promoted sides. Checked the same
 * day as the photos.
 */
const PL = `${RESOURCES}/premierleague`

/** Prefixes with Vite's base so assets resolve under the Pages subpath. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

export const managerImage = (set: 'icon' | 'koch' | 'motm' | 'winner', key: string, format: 'webp' | 'jpg') =>
  asset(`images/${set}/${key}.${format}`)

/** The icon set also has an @2x, for anything rendered above 64px. */
export const managerIcon2x = (key: string, format: 'webp' | 'jpg') => asset(`images/icon/${key}@2x.${format}`)

/**
 * The one place a player photo URL is built. Every caller goes through here so
 * the next time FPL moves the path it is a one-line change.
 *
 * `small`  — 110x140, served at 220×280. Table rows and squad cards.
 * `tiny`   — 40x40, served at 80×80. Anything under 40px.
 * `large`  — 500x500. Feature panels.
 */
export type PhotoSize = 'tiny' | 'small' | 'large'

const PHOTO_SEGMENT: Record<PhotoSize, string> = {
  tiny: '40x40',
  small: '110x140',
  large: '500x500',
}

export const playerPhoto = (photoCode: number, size: PhotoSize = 'small') =>
  `${RESOURCES}/${PHOTO_SEASON}/photos/players/${PHOTO_SEGMENT[size]}/${photoCode}.png`

export const clubBadge = (clubCode: number, size: 20 | 50 | 70 | 100 = 50) => `${PL}/badges/${size}/t${clubCode}.png`

export const PLAYER_FALLBACK = asset('images/player-silhouette.svg')
export const BADGE_FALLBACK = asset('images/badge-placeholder.svg')
export const LION = asset('images/premier-league-logo.png')
