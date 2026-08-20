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

const PL = 'https://resources.premierleague.com/premierleague'

/** Prefixes with Vite's base so assets resolve under the Pages subpath. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

export const managerImage = (set: 'icon' | 'koch' | 'motm' | 'winner', key: string, format: 'webp' | 'jpg') =>
  asset(`images/${set}/${key}.${format}`)

/** The icon set also has an @2x, for anything rendered above 64px. */
export const managerIcon2x = (key: string, format: 'webp' | 'jpg') => asset(`images/icon/${key}@2x.${format}`)

/** Served at 220×280 despite the path. Right size for table rows. */
export const playerPhoto = (photoCode: number) => `${PL}/photos/players/110x140/p${photoCode}.png`

/** Served at 500×500. For the leading-scorer panel and profile headers. */
export const playerPhotoLarge = (photoCode: number) => `${PL}/photos/players/250x250/p${photoCode}.png`

export const clubBadge = (clubCode: number, size: 20 | 50 | 70 | 100 = 50) => `${PL}/badges/${size}/t${clubCode}.png`

export const PLAYER_FALLBACK = asset('images/player-silhouette.svg')
export const BADGE_FALLBACK = asset('images/badge-placeholder.svg')
export const LION = asset('images/premier-league-logo.png')
