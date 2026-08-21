/**
 * Per-club scale for player photos in cards.
 *
 * A workaround for upstream inconsistency. The Premier League CDN serves
 * every player at the same pixel size, but clubs shoot their own headshots
 * and three of them frame wide: measured from the alpha channel of the
 * 2026/27 photos, Sunderland leaves 12.9% of the frame empty above the
 * head, Tottenham 10.7% and Brighton 8.6%, where every other club leaves
 * none, and their heads are correspondingly smaller. The 500×500 variant
 * has the same framing, so there is no fix in choosing a different file.
 *
 * The scale is applied as a transform on the photo with its origin at the
 * bottom centre, so the figure grows upward into the headroom and the
 * shoulders stay on the name band. 1 is untouched.
 *
 * Revisit if the CDN reshoots. The measurement was the alpha channel of one
 * owned player per club: the first opaque row gives the headroom, and the
 * widest opaque run in the top fifth of the figure gives the head width as
 * a fraction of the frame (the norm is about a third). The quick check by
 * eye is empty space above the hair on the card. Hull and Ipswich had no
 * current CDN photo to measure when this was set.
 *
 * Local overrides are not in this map: they are normalised to the CDN
 * composition when the file is made (head a third of the width, no
 * headroom, 11:14), so they need no correction here.
 *
 * Keyed by club code, which is stable across seasons; team ids are not.
 */
export const CLUB_PHOTO_SCALE: Readonly<Record<number, number>> = {
  56: 1.18, // Sunderland
  6: 1.15, // Tottenham
  36: 1.1, // Brighton
}

export function clubPhotoScale(clubCode: number): number {
  return CLUB_PHOTO_SCALE[clubCode] ?? 1
}
