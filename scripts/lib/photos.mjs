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
async function cdnHasPhoto(code, { userAgent, photoUrl }) {
  try {
    const response = await fetch(photoUrl(code), {
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
 * Owned players with neither a local override nor a CDN photo.
 *
 * Scoped to owned players deliberately: several hundred unowned players also
 * lack photos and nobody is going to go looking for those.
 */
export async function findMissingPhotos({ owned, overrides, userAgent, photoUrl, concurrency = 8 }) {
  const candidates = owned.filter((player) => !overrides.has(player.photoCode))
  const present = await mapWithLimit(candidates, concurrency, (player) =>
    cdnHasPhoto(player.photoCode, { userAgent, photoUrl })
  )
  return candidates.filter((_, i) => !present[i])
}

export function formatMissingReport(missing, nameOf) {
  if (missing.length === 0) return 'Every owned player has a photo.'

  const lines = [
    `${missing.length} owned player(s) have no photo. Save a square image as the filename shown:`,
    '',
  ]
  const nameWidth = Math.max(...missing.map((p) => p.name.length))
  const pathWidth = Math.max(...missing.map((p) => `${OVERRIDE_DIR}/${p.photoCode}.png`.length))
  for (const player of missing.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(
      `  ${`${OVERRIDE_DIR}/${player.photoCode}.png`.padEnd(pathWidth)}` +
        `   ${player.name.padEnd(nameWidth)}  ${player.clubShort.padEnd(4)} ${nameOf(player.owner)}`
    )
  }
  lines.push('', 'Anything dropped in there is picked up on the next fetch. No rebuild needed.')
  return lines.join('\n')
}
