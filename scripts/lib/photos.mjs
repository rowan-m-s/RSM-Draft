/**
 * Which owned players have no photo, and what to do about it.
 *
 * FPL's CDN has no image for a good number of players, overwhelmingly the ones
 * who have just transferred. They fall back to a silhouette, which is fine as
 * a default and poor for someone in your own squad. A local file in
 * public/images/players/{code}.png overrides it.
 *
 * The point of the report is that there is otherwise no way to know which
 * images to go and find: nothing errors, the silhouette just quietly appears.
 */

import { readdir } from 'node:fs/promises'
import path from 'node:path'

export const OVERRIDE_DIR = 'public/images/players'

/**
 * Element codes with a local override on disk.
 *
 * Keyed on `code`, not id: the code is stable across seasons, so a file saved
 * this August still matches the same player next August.
 */
export async function readOverrides() {
  try {
    const files = await readdir(OVERRIDE_DIR)
    return new Set(
      files
        .map((file) => path.parse(file).name)
        .filter((name) => /^\d+$/.test(name))
        .map(Number)
    )
  } catch {
    return new Set()
  }
}

/**
 * Does the CDN actually have this photo?
 *
 * A missing one answers 403 rather than 404, which still means "no image".
 * Only the existence matters here, so the smallest size is requested.
 */
async function resolves(url, userAgent) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(15_000),
    })
    const body = await response.arrayBuffer().catch(() => new ArrayBuffer(0))
    return response.ok && body.byteLength > 0
  } catch {
    // A network blip should not be reported as a missing photo.
    return true
  }
}

/** Runs `worker` over `items`, `limit` at a time. */
async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await worker(items[index])
      }
    })
  )
  return results
}

/**
 * Owned players not being served a current photo, split by what to do next.
 *
 * The split is the useful part. A player falling through to the legacy CDN is
 * showing their old club's shirt, but that fixes itself the moment FPL
 * publishes a current photo, so it needs no action. A player with nothing
 * anywhere shows a silhouette until somebody finds an image, and those are the
 * only ones worth spending time on.
 *
 * Scoped to owned players deliberately: several hundred unowned players also
 * lack photos and nobody is going to go looking for those.
 */
export async function findMissingPhotos({
  owned,
  overrides,
  userAgent,
  photoUrl,
  legacyPhotoUrl,
  concurrency = 8,
}) {
  const candidates = owned.filter((player) => !overrides.has(player.photoCode))
  const onCurrent = await mapWithLimit(candidates, concurrency, (player) =>
    resolves(photoUrl(player.photoCode), userAgent)
  )
  const withoutCurrent = candidates.filter((_, i) => !onCurrent[i])

  const onLegacy = await mapWithLimit(withoutCurrent, concurrency, (player) =>
    resolves(legacyPhotoUrl(player.photoCode), userAgent)
  )

  // The other direction: an override takes precedence in the browser, so a
  // stopgap photo would shadow the real one forever once FPL publishes it.
  // Probe every overridden player against the current CDN and say which
  // files can go.
  const overridden = owned.filter((player) => overrides.has(player.photoCode))
  const overrideOnCurrent = await mapWithLimit(overridden, concurrency, (player) =>
    resolves(photoUrl(player.photoCode), userAgent)
  )

  return {
    /** Nothing anywhere. Silhouette until an override is supplied. */
    noImage: withoutCurrent.filter((_, i) => !onLegacy[i]),
    /** Showing last season's photo. Self-heals; no action needed. */
    legacyOnly: withoutCurrent.filter((_, i) => onLegacy[i]),
    /** Has an override, but the CDN now has a current photo. Delete the file. */
    redundantOverrides: overridden.filter((_, i) => overrideOnCurrent[i]),
  }
}

function table(players, nameOf, withFilename) {
  const nameWidth = Math.max(...players.map((p) => p.name.length))
  const pathWidth = withFilename
    ? Math.max(...players.map((p) => `${OVERRIDE_DIR}/${p.photoCode}.png`.length))
    : 0
  return players
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((player) => {
      const prefix = withFilename
        ? `${`${OVERRIDE_DIR}/${player.photoCode}.png`.padEnd(pathWidth)}   `
        : `${String(player.photoCode).padEnd(7)}  `
      return `  ${prefix}${player.name.padEnd(nameWidth)}  ${player.clubShort.padEnd(4)} ${nameOf(player.owner)}`
    })
}

export function formatMissingReport({ noImage, legacyOnly, redundantOverrides = [] }, nameOf) {
  if (noImage.length === 0 && legacyOnly.length === 0 && redundantOverrides.length === 0) {
    return 'Every owned player has a current photo.'
  }

  const lines = []

  if (redundantOverrides.length > 0) {
    lines.push(
      `${redundantOverrides.length} override(s) are no longer needed: the CDN now has a current photo`,
      'for these players, but the local file still wins. Delete each file listed:',
      '',
      ...table(redundantOverrides, nameOf, true),
      ''
    )
  }

  if (noImage.length > 0) {
    lines.push(
      `${noImage.length} owned player(s) have no image anywhere and show a silhouette.`,
      'These are the ones worth sourcing by hand. Save each as the filename shown:',
      '',
      ...table(noImage, nameOf, true),
      ''
    )
  }

  if (legacyOnly.length > 0) {
    lines.push(
      `${legacyOnly.length} owned player(s) are falling back to last season's photo,`,
      'so they appear in their previous club\'s shirt. Ignore these: FPL publishes a',
      'current photo within a few weeks of a transfer and they correct themselves.',
      '',
      ...table(legacyOnly, nameOf, false),
      ''
    )
  }

  if (noImage.length > 0) {
    lines.push('Anything dropped into the override folder is picked up on the next fetch.')
    lines.push('Match the CDN: 219x280 PNG, transparent background, subject filling the frame.')
  }
  return lines.join('\n')
}
