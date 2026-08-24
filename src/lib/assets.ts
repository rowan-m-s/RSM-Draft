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
 * this league. Of those 23, eleven do resolve on the OLD path, and every one
 * of the eleven is wearing their previous club's shirt: Bruno G. in Newcastle
 * stripes, Rogers in Aston Villa, Welbeck in Brighton. That is the cost of the
 * legacy tier below, and it is accepted knowingly: those photos are stale
 * precisely because the player just transferred, so FPL will publish a current
 * one within weeks and the fallback stops firing on its own.
 */
const PHOTO_SEASON = 'premierleague25'

/**
 * The previous season's folder, kept as a last resort before the silhouette.
 *
 * It holds no players who arrived this summer, and for anyone who moved
 * between Premier League clubs it shows the old kit. A recognisable player in
 * the wrong shirt was judged better than an anonymous silhouette, on the basis
 * that it corrects itself: the moment FPL publishes a current photo the tier
 * above wins and this one is never reached.
 *
 * Note the different filename convention. The legacy path prefixes the code
 * with `p`; the current one does not.
 */
const LEGACY_SEASON = 'premierleague'

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

export type ManagerImageSet = 'icon' | 'koch' | 'motm' | 'winner'

export const managerImage = (set: ManagerImageSet, key: string, format: 'webp' | 'jpg') =>
  asset(`images/${set}/${key}.${format}`)

/** A player-keyed graphic: one of several per manager, chosen by the fetch job. */
export const playerGraphic = (set: 'leader' | 'koch', key: string, code: number, format: 'webp' | 'jpg') =>
  asset(`images/${set}/${key}.${code}.${format}`)

/** Which Koch graphic a manager's nth award shows (0-based): they alternate. */

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

/** The legacy folder has no 500x500; 250x250 is its largest. */
const LEGACY_SEGMENT: Record<PhotoSize, string> = {
  tiny: '40x40',
  small: '110x140',
  large: '250x250',
}

export const playerPhoto = (photoCode: number, size: PhotoSize = 'small') =>
  `${RESOURCES}/${PHOTO_SEASON}/photos/players/${PHOTO_SEGMENT[size]}/${photoCode}.png`

/**
 * Local overrides for players the CDN has no photo for.
 *
 * Keyed on the element `code`, which is stable across seasons; the id is not,
 * so a file named by id could silently attach to a different player next
 * August.
 *
 * The set is published in league.json rather than probed from the browser.
 * Trying the local path first and falling back on error would mean a 404 for
 * every one of the ~150 players who do not have an override, on every page
 * load. The fetch job already knows what is in the folder, so it says so.
 */
let overrides: ReadonlySet<number> = new Set()

export function setPlayerImageOverrides(codes: readonly number[] | undefined) {
  overrides = new Set(codes ?? [])
}

export const playerImageOverride = (photoCode: number) =>
  overrides.has(photoCode) ? asset(`images/players/${photoCode}.png`) : null

/** The image to try first: a local override if there is one, else the CDN. */
export const playerPhotoLegacy = (photoCode: number, size: PhotoSize = 'small') =>
  `${RESOURCES}/${LEGACY_SEASON}/photos/players/${LEGACY_SEGMENT[size]}/p${photoCode}.png`

/**
 * Every source to try for a player, in order, before giving up and showing the
 * silhouette: local override, current CDN, legacy CDN.
 *
 * Walking the list costs a failed request only for the players who need it,
 * and the browser caches the failure for the session.
 */
export function playerPhotoSources(photoCode: number, size: PhotoSize = 'small'): string[] {
  const override = playerImageOverride(photoCode)
  return [...(override ? [override] : []), playerPhoto(photoCode, size), playerPhotoLegacy(photoCode, size)]
}

/**
 * A source with the responsive variants the CDN actually has, so a 3× phone
 * gets the 500px file and a 1× or 2× screen is not made to pay for it.
 *
 * The CDN serves each path at twice its name: 110x140 is 220×280 and 500x500
 * is 500×500. A card drawn 104px wide needs 208px at 2× and 312px at 3×, so
 * the browser picks 220 for the first and 500 for the second from the widths
 * declared here. The two are framed a little differently — the 500 is a
 * square with the figure at about 93% of the width, the 220 fills it — so a
 * 3× device shows a touch more chest. Accepted: it is consistent on any one
 * device, and the alternative is 395KB per player for everyone.
 *
 * A local override is one file at one size, so it carries no srcset.
 */
export interface PhotoSource {
  src: string
  srcSet?: string
}

export function playerPhotoCandidates(photoCode: number, version: string | null = null): PhotoSource[] {
  const override = playerImageOverride(photoCode)
  // The CDN replaces photos under the same URL. A version from the framing
  // measurement pins the browser to the bytes that were measured, past any
  // older copy in its cache. The CDN ignores the query string.
  const v = (url: string) => (version ? `${url}?v=${version}` : url)
  return [
    ...(override ? [{ src: override }] : []),
    {
      src: v(playerPhoto(photoCode, 'small')),
      srcSet: `${v(playerPhoto(photoCode, 'small'))} 220w, ${v(playerPhoto(photoCode, 'large'))} 500w`,
    },
    {
      src: v(playerPhotoLegacy(photoCode, 'small')),
      srcSet: `${v(playerPhotoLegacy(photoCode, 'small'))} 220w, ${v(playerPhotoLegacy(photoCode, 'large'))} 500w`,
    },
  ]
}

export const clubBadge = (clubCode: number, size: 20 | 50 | 70 | 100 = 50) => `${PL}/badges/${size}/t${clubCode}.png`

export const PLAYER_FALLBACK = asset('images/player-silhouette.svg')
export const BADGE_FALLBACK = asset('images/badge-placeholder.svg')
export const LION = asset('images/premier-league-logo.png')
/** The lion alone, cropped from the lockup, for the Fantasy Draft mark. */
export const LION_ONLY = asset('images/premier-league-lion.png')
