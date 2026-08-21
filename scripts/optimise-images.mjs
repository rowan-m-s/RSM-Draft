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
import {
  BADGE_PLACEHOLDER_SVG,
  FORMATS,
  MANAGER_KEYS,
  MANAGER_SETS,
  OUT_DIR,
  PLAYER_SILHOUETTE_SVG,
  SEASON_SETS,
  SOURCE_DIR,
  classifySourceFile,
} from './images.shared.mjs'

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
  leader: { fit: 'inside', sizes: [900] },
  winner: { fit: 'inside', sizes: [900] },
}

/**
 * Where the head actually is, measured rather than assumed.
 *
 * The eleven icons are the same studio setup — square, white background,
 * subject centred — but the framing is not consistent: the top of the head
 * ranges from 11% to 24% down the image, and the heads differ in size. A fixed
 * crop that suits one person clips the next one's chin.
 *
 * The subject is dark on white, so a row-by-row width profile finds the shape
 * directly. Reading down: nothing, then the head (widening, then narrowing),
 * then a minimum at the neck, then a sharp jump at the shoulders. The neck
 * minimum is the reliable landmark; the chin sits just above it.
 *
 * sharp's `attention` strategy is no use here — the sources are already square
 * so `cover` never crops, and on a white-background portrait attention latches
 * onto the suit and tie as often as the face.
 */
const ANALYSIS_SIZE = 400
/** Anything darker than this is subject, not backdrop. */
const SUBJECT_THRESHOLD = 235

async function measureHead(file) {
  const { data, info } = await sharp(file)
    .flatten({ background: '#ffffff' })
    .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const rows = []
  for (let y = 0; y < info.height; y++) {
    let minX = -1
    let maxX = -1
    let count = 0
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < SUBJECT_THRESHOLD) {
        if (minX < 0) minX = x
        maxX = x
        count++
      }
    }
    rows.push({ width: maxX < 0 ? 0 : maxX - minX + 1, count, minX, maxX })
  }

  // A few stray dark pixels are compression noise, not hair.
  const headTop = rows.findIndex((r) => r.count > 3)
  if (headTop < 0) return null

  let peakY = headTop
  let peakWidth = 0
  for (let y = headTop; y < headTop + (info.height - headTop) * 0.5; y++) {
    if (rows[y].width > peakWidth) {
      peakWidth = rows[y].width
      peakY = y
    }
  }

  let shoulderY = rows.findIndex((r, y) => y > peakY && r.width > peakWidth * 1.6)
  if (shoulderY < 0) shoulderY = info.height - 1

  let chinY = peakY
  let neckWidth = Infinity
  for (let y = peakY; y < shoulderY; y++) {
    if (rows[y].width <= neckWidth) {
      neckWidth = rows[y].width
      chinY = y
    }
  }

  // Horizontal centre taken across the head only, so a turned shoulder or a
  // raised arm cannot drag the framing sideways.
  let sumX = 0
  let n = 0
  for (let y = peakY; y < chinY; y++) {
    if (rows[y].width > peakWidth * 0.5) {
      sumX += (rows[y].minX + rows[y].maxX) / 2
      n++
    }
  }

  return {
    headTop: headTop / info.height,
    chin: chinY / info.height,
    centreX: (n ? sumX / n : info.width / 2) / info.width,
  }
}

/**
 * Headroom above the hairline and below the chin, as multiples of head height.
 * Slightly more below than above so the head sits a touch high in the circle,
 * which is how portraits are normally cropped.
 */
const HEAD_PADDING = { above: 0.26, below: 0.42 }

function faceRegion(meta, head) {
  const size = Math.min(meta.width, meta.height)
  if (!head) {
    // Fallback if the profile could not be read — the old fixed crop.
    const side = Math.round(size * 0.6)
    return { left: Math.round((meta.width - side) / 2), top: Math.round(meta.height * 0.04), width: side, height: side }
  }

  const headHeight = (head.chin - head.headTop) * meta.height
  let side = Math.round(headHeight * (1 + HEAD_PADDING.above + HEAD_PADDING.below))
  let top = Math.round(head.headTop * meta.height - headHeight * HEAD_PADDING.above)
  let left = Math.round(head.centreX * meta.width - side / 2)

  // Clamp inside the image without changing the crop size, so every icon keeps
  // the same head-to-frame ratio.
  side = Math.min(side, meta.width, meta.height)
  top = Math.max(0, Math.min(top, meta.height - side))
  left = Math.max(0, Math.min(left, meta.width - side))

  return { left, top, width: side, height: side }
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

  /**
   * Classify everything in the folder and say what happened to each file.
   *
   * `assets-src/` holds more than manager images — the banner lockup and the
   * reference screenshots live there too. Skipping them quietly would be fine
   * right up until someone misnames a real asset, at which point a typo and a
   * deliberate exclusion look identical. So every file is accounted for.
   */
  const classified = sources.map(classifySourceFile)
  const jobs = classified
    .filter((entry) => entry.status === 'asset')
    .map((entry) => ({ ...entry, source: path.join(SOURCE_DIR, entry.filename) }))

  const ignored = classified.filter((entry) => entry.status === 'ignored')
  const knownOther = classified.filter((entry) => entry.status === 'known-other')
  const held = classified.filter((entry) => entry.status === 'held')
  const badKeys = classified.filter((entry) => entry.status === 'unknown-key')
  const aliased = jobs.filter((job) => job.aliasOf)

  console.log(`Scanned ${SOURCE_DIR}/ — ${classified.length} files.\n`)

  if (knownOther.length > 0) {
    console.log(`Not manager images, expected (${knownOther.length}):`)
    for (const entry of knownOther) console.log(`  · ${entry.filename.padEnd(24)} ${entry.reason}`)
    console.log()
  }

  if (held.length > 0) {
    console.log(`Held back (${held.length}):`)
    for (const entry of held) console.log(`  · ${entry.filename.padEnd(24)} ${entry.reason}`)
    console.log()
  }

  if (aliased.length > 0) {
    console.log(`Key corrected (${aliased.length}):`)
    for (const job of aliased) console.log(`  · ${job.filename.padEnd(24)} "${job.aliasOf}" read as "${job.key}"`)
    console.log()
  }

  if (ignored.length > 0) {
    console.log(`Skipped (${ignored.length}):`)
    for (const entry of ignored) console.log(`  · ${entry.filename.padEnd(24)} ${entry.reason}`)
    console.log()
  }

  // A near-miss key is a typo, and a typo silently produces an image nobody
  // ever renders. Stop rather than write it.
  if (badKeys.length > 0) {
    console.error(`Unrecognised manager key in ${badKeys.length} file(s):\n`)
    for (const entry of badKeys) console.error(`  ✗ ${entry.filename}\n      ${entry.reason}`)
    console.error(`\nRename the file, or add the key to MANAGER_KEYS if it is a new manager.\n`)
    process.exit(1)
  }

  if (jobs.length === 0) {
    console.error(`No manager images in ${SOURCE_DIR}/. Expected {key}.{icon|koch|motm|leader|winner}.{png|jpg}`)
    process.exit(1)
  }

  // Two sources for the same slot means the winner is decided by directory
  // order, which is nobody's intention.
  const bySlot = new Map()
  for (const job of jobs) {
    const slot = `${job.set}/${job.key}`
    if (bySlot.has(slot)) {
      console.error(
        `Two sources for ${slot}: ${bySlot.get(slot)} and ${job.filename}. ` +
          `Delete one — otherwise which is used depends on directory order.`
      )
      process.exit(1)
    }
    bySlot.set(slot, job.filename)
  }

  // Report the manager set's completeness here, at import, rather than leaving
  // it to the build. 11 keys × 4 sets = 44.
  const missing = []
  for (const set of MANAGER_SETS) {
    for (const key of MANAGER_KEYS) {
      if (!bySlot.has(`${set}/${key}`)) missing.push(`${key}.${set}.*`)
    }
  }
  const found = MANAGER_KEYS.length * MANAGER_SETS.length - missing.length
  console.log(`Manager sources: ${found}/${MANAGER_KEYS.length * MANAGER_SETS.length}`)
  if (missing.length > 0) {
    console.error(`\nMissing ${missing.length} manager source(s):`)
    for (const name of missing) console.error(`  ✗ ${name}`)
    console.error()
    process.exit(1)
  }
  const winners = jobs.filter((job) => job.set === 'winner')
  console.log(`Winner cards:    ${winners.length} (${winners.map((w) => w.key).join(', ') || 'none'}) — validated against honours.json, not the eleven keys.\n`)

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
    const head = recipe.faceCrop ? await measureHead(job.source) : null
    const crop = recipe.faceCrop ? faceRegion(meta, head) : null

    for (const size of recipe.sizes) {
      for (const format of FORMATS) {
        const target = outPath(job.set, job.key, size, recipe.sizes, format)
        if (!force && (await mtime(target)) > sourceTime) {
          skipped++
          continue
        }

        let pipeline = sharp(job.source).rotate()
        if (crop) pipeline = pipeline.extract(crop)
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
      head: head ? `top ${(head.headTop * 100).toFixed(0)}% chin ${(head.chin * 100).toFixed(0)}%` : '',
    })
  }

  console.table(report)
  console.log(`\n${written} written, ${skipped} up to date.`)

  const orientations = report.reduce((acc, r) => ((acc[r.orientation] = (acc[r.orientation] ?? 0) + 1), acc), {})
  console.log(`Orientations: ${JSON.stringify(orientations)} — card frames must letterbox both.`)

  // The Premier League lion, used in the header and every page banner.
  const logoSource = path.join(SOURCE_DIR, 'PremierLeagueLogo.png')
  if (await mtime(logoSource)) {
    // The supplied file is a 500×210 lockup — the lion *and* the wordmark, so
    // roughly 2.4:1. It is not a square lion, and anything that renders it in a
    // square box squashes it. `fit: inside` preserves the ratio here; the
    // markup has to do the same.
    const logoMeta = await sharp(logoSource).metadata()
    await sharp(logoSource)
      .resize({ width: 480, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, 'premier-league-logo.png'))
    console.log(
      `Wrote public/images/premier-league-logo.png ` +
        `(source ${logoMeta.width}×${logoMeta.height}, aspect ${(logoMeta.width / logoMeta.height).toFixed(2)}:1 — render with width:auto)`
    )
  } else {
    console.warn(`Missing ${logoSource} — the banner lion will not render.`)
  }

  // The fallbacks for a player with no photo and a club with no badge. New
  // signings routinely have no photo for weeks, and FPL answers 403 for
  // those, so every <img> needs somewhere to fall back to. The drawings live
  // in images.shared.mjs, in the theme's colours, and are pinned by a test.
  await writeFile(path.join(OUT_DIR, 'player-silhouette.svg'), PLAYER_SILHOUETTE_SVG)
  await writeFile(path.join(OUT_DIR, 'badge-placeholder.svg'), BADGE_PLACEHOLDER_SVG)
  console.log('Wrote fallback silhouette and badge placeholder.')

  await optimiseOverrides()

  if (process.argv.includes('--preview')) await writeIconContactSheet()
}

/**
 * Shrink the local player photo overrides, in place.
 *
 * These are dropped into public/images/players/ by hand and served straight
 * from there, so nothing else in the pipeline ever touches them. Left alone a
 * single 2048px source can be 4 MB, which is twenty times the largest manager
 * card and lands on a phone in a pub.
 *
 * Capped at the CDN's own largest variant, 500px, which is far more than the
 * 64px circles they are actually rendered in. Alpha is preserved: these are
 * cut-outs and a flattened background would show as a box on the pitch.
 */
const OVERRIDE_MAX_EDGE = 500

async function optimiseOverrides() {
  const dir = path.join(OUT_DIR, 'players')
  let files
  try {
    files = (await readdir(dir)).filter((name) => /^\d+\.png$/.test(name))
  } catch {
    return
  }
  if (files.length === 0) return

  const report = []
  for (const name of files) {
    const file = path.join(dir, name)
    const before = (await stat(file)).size
    const meta = await sharp(file).metadata()

    const oversized = Math.max(meta.width, meta.height) > OVERRIDE_MAX_EDGE
    // Already small and already within the cap: nothing to gain.
    if (!oversized && before < 120_000) {
      report.push({ file: name, size: `${(before / 1024).toFixed(0)} KB`, action: 'already small' })
      continue
    }

    const optimised = await sharp(file)
      .resize({ width: OVERRIDE_MAX_EDGE, height: OVERRIDE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer()

    // Never make a file bigger by "optimising" it.
    if (optimised.length >= before && !oversized) {
      report.push({ file: name, size: `${(before / 1024).toFixed(0)} KB`, action: 'left alone' })
      continue
    }

    await writeFile(file, optimised)
    const after = (await sharp(optimised).metadata())
    report.push({
      file: name,
      size: `${(before / 1024).toFixed(0)} KB -> ${(optimised.length / 1024).toFixed(0)} KB`,
      action: `${meta.width}x${meta.height} -> ${after.width}x${after.height}`,
    })
  }

  console.log('\nPlayer photo overrides:')
  console.table(report)
}

/**
 * `--preview` writes a contact sheet of every icon masked into a circle, which
 * is the only honest way to check a face crop. A number in a config file tells
 * you nothing about whether someone's chin is missing.
 */
async function writeIconContactSheet() {
  const size = 150
  const inner = size - 10
  const mask = Buffer.from(
    `<svg width="${inner}" height="${inner}"><circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}" fill="#fff"/></svg>`
  )

  const tiles = []
  for (const key of MANAGER_KEYS) {
    const circle = await sharp(path.join(OUT_DIR, 'icon', `${key}@2x.webp`))
      .resize(inner, inner)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer()
    const frame = Buffer.from(
      `<svg width="${size}" height="${size + 20}"><rect width="${size}" height="${size + 20}" fill="#f7f7f9"/>` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${inner / 2}" fill="#fff" stroke="#e5e5eb"/>` +
        `<text x="${size / 2}" y="${size + 14}" font-family="monospace" font-size="13" text-anchor="middle" fill="#1b1b3a">${key}</text></svg>`
    )
    tiles.push(await sharp(frame).composite([{ input: circle, left: 5, top: 5 }]).png().toBuffer())
  }

  const columns = 6
  const out = 'icon-contact-sheet.png'
  await sharp({
    create: {
      width: size * columns,
      height: (size + 20) * Math.ceil(tiles.length / columns),
      channels: 3,
      background: '#f7f7f9',
    },
  })
    .composite(
      tiles.map((input, i) => ({
        input,
        left: (i % columns) * size,
        top: Math.floor(i / columns) * (size + 20),
      }))
    )
    .png()
    .toFile(out)
  console.log(`Wrote ${out} — check every chin and hairline before committing.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
