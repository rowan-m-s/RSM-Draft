#!/usr/bin/env node
/**
 * Turn the source photographs into web-sized assets.
 *
 * The sources are multi-megabyte PNGs — 36 of them, well over 100 MB. That is
 * far too much for a public repo and unusable on mobile data in a pub, which is
 * exactly where this site gets opened. Sources stay in `assets-src/`
 * (gitignored); only the optimised output in `public/images/` is committed.
 *
 *   node scripts/optimise-images.mjs [--force]
 *
 * Skips anything already newer than its source unless --force is passed.
 */

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { FORMATS, MANAGER_SETS, OUT_DIR, SEASON_SETS, SOURCE_DIR, parseSourceName } from './images.shared.mjs'

const force = process.argv.includes('--force')

/**
 * Icons are the one set that *should* be square-cropped — they render as small
 * circular avatars, 28px in table rows and larger on feature cards. 64 and 128
 * cover 1× and 2×.
 *
 * Koch and MOTM cards are mixed portrait and landscape. Forcing them square
 * decapitates people, so they are resized to fit inside a box and letterboxed
 * by the card frame in CSS instead.
 */
const RECIPES = {
  icon: { fit: 'cover', sizes: [64, 128], faceCrop: true },
  koch: { fit: 'inside', sizes: [900] },
  motm: { fit: 'inside', sizes: [900] },
  winner: { fit: 'inside', sizes: [900] },
}

/**
 * All eleven icons are the same studio headshot: square, white background,
 * head about 8–48% down and horizontally centred. Resizing the whole square
 * into a 28px circle leaves a recognisable tie and an unrecognisable face, so
 * take a square off the top instead.
 *
 * Fixed proportions rather than sharp's `attention` strategy: the sources are
 * already square, so `cover` never crops, and attention on a white-background
 * portrait latches onto the suit as often as the face. These eleven are
 * consistent enough that fixed numbers beat a heuristic.
 */
const FACE_CROP = { side: 0.6, top: 0.04 }

function faceRegion(meta) {
  const side = Math.round(Math.min(meta.width, meta.height) * FACE_CROP.side)
  return {
    left: Math.round((meta.width - side) / 2),
    top: Math.round(meta.height * FACE_CROP.top),
    width: side,
    height: side,
  }
}

const QUALITY = { webp: 82, jpg: 80 }

async function mtime(file) {
  try {
    return (await stat(file)).mtimeMs
  } catch {
    return 0
  }
}

/** Output path: `public/images/icon/rushy.webp`, `.../rushy@2x.webp`. */
function outPath(set, key, size, sizes, format) {
  const suffix = sizes.length > 1 && size !== sizes[0] ? `@${Math.round(size / sizes[0])}x` : ''
  return path.join(OUT_DIR, set, `${key}${suffix}.${format}`)
}

async function main() {
  let sources
  try {
    sources = await readdir(SOURCE_DIR)
  } catch {
    console.error(
      `No ${SOURCE_DIR}/ directory. The source photographs live there, gitignored — ` +
        `they are not in the repo. Restore them before running this.`
    )
    process.exit(1)
  }

  const jobs = []
  for (const filename of sources) {
    const parsed = parseSourceName(filename)
    if (!parsed) continue
    jobs.push({ ...parsed, source: path.join(SOURCE_DIR, filename) })
  }

  if (jobs.length === 0) {
    console.error(`No recognisable images in ${SOURCE_DIR}/. Expected {name}.{icon|koch|motm|winner}.{png|jpg}`)
    process.exit(1)
  }

  for (const set of [...MANAGER_SETS, ...SEASON_SETS]) {
    await mkdir(path.join(OUT_DIR, set), { recursive: true })
  }

  let written = 0
  let skipped = 0
  const report = []

  for (const job of jobs.sort((a, b) => `${a.set}${a.key}`.localeCompare(`${b.set}${b.key}`))) {
    const recipe = RECIPES[job.set]
    const sourceTime = await mtime(job.source)
    const meta = await sharp(job.source).metadata()
    const orientation = meta.width >= meta.height ? 'landscape' : 'portrait'

    for (const size of recipe.sizes) {
      for (const format of FORMATS) {
        const target = outPath(job.set, job.key, size, recipe.sizes, format)
        if (!force && (await mtime(target)) > sourceTime) {
          skipped++
          continue
        }

        let pipeline = sharp(job.source).rotate()
        if (recipe.faceCrop) pipeline = pipeline.extract(faceRegion(meta))
        pipeline = pipeline.resize({
          width: size,
          height: size,
          fit: recipe.fit,
          withoutEnlargement: true,
        })

        pipeline =
          format === 'webp'
            ? pipeline.webp({ quality: QUALITY.webp })
            : pipeline.jpeg({ quality: QUALITY.jpg, mozjpeg: true, chromaSubsampling: '4:4:4' })

        await pipeline.toFile(target)
        written++
      }
    }

    const outSize = await stat(outPath(job.set, job.key, recipe.sizes[0], recipe.sizes, 'webp'))
    const sourceSize = (await stat(job.source)).size
    report.push({
      file: `${job.set}/${job.key}`,
      orientation,
      source: `${(sourceSize / 1024 / 1024).toFixed(1)} MB`,
      out: `${(outSize.size / 1024).toFixed(0)} KB`,
      dimensions: `${meta.width}×${meta.height}`,
    })
  }

  console.table(report)
  console.log(`\n${written} written, ${skipped} up to date.`)

  const orientations = report.reduce((acc, r) => ((acc[r.orientation] = (acc[r.orientation] ?? 0) + 1), acc), {})
  console.log(`Orientations: ${JSON.stringify(orientations)} — card frames must letterbox both.`)

  // The Premier League lion, used in the header and every page banner.
  const logoSource = path.join(SOURCE_DIR, 'PremierLeagueLogo.png')
  if (await mtime(logoSource)) {
    await sharp(logoSource)
      .resize({ width: 240, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, 'premier-league-logo.png'))
    console.log('Wrote public/images/premier-league-logo.png')
  } else {
    console.warn(`Missing ${logoSource} — the banner lion will not render.`)
  }

  // A neutral silhouette for players whose photo has not landed yet. New
  // signings routinely have none for weeks, and FPL answers 403 for those, so
  // every <img> needs somewhere to fall back to.
  await writeFile(
    path.join(OUT_DIR, 'player-silhouette.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="No photo">
  <rect width="100" height="100" fill="#E5E5EB"/>
  <circle cx="50" cy="38" r="17" fill="#B9B9C6"/>
  <path d="M16 100c0-19 15-31 34-31s34 12 34 31z" fill="#B9B9C6"/>
</svg>\n`
  )
  await writeFile(
    path.join(OUT_DIR, 'badge-placeholder.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="No badge">
  <path d="M50 6 88 20v34c0 22-16 34-38 40C28 88 12 76 12 54V20z" fill="#E5E5EB" stroke="#B9B9C6" stroke-width="4"/>
</svg>\n`
  )
  console.log('Wrote fallback silhouette and badge placeholder.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
