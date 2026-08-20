#!/usr/bin/env node
/**
 * Build-time assertion that every image the app will ask for actually exists.
 *
 * A missing file means a blank card or a hole in a table row, and nobody
 * notices until it is that person's week. So the build fails instead.
 *
 * Two different rules, deliberately:
 *   icon / koch / motm — must hold exactly the eleven manager keys. 33 files.
 *   winner            — one image per PAST SEASON, not per manager. Validated
 *                       the other way round: every entry in honours.json must
 *                       have a file. Nine managers having none is expected.
 */

import { access } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FORMATS, MANAGER_KEYS, MANAGER_SETS, OUT_DIR } from './images.shared.mjs'

const exists = (file) =>
  access(file).then(
    () => true,
    () => false
  )

async function main() {
  const problems = []
  let checked = 0

  for (const set of MANAGER_SETS) {
    for (const key of MANAGER_KEYS) {
      for (const format of FORMATS) {
        const file = path.join(OUT_DIR, set, `${key}.${format}`)
        checked++
        if (!(await exists(file))) problems.push(`missing ${file}`)
      }
    }
  }

  let honours
  try {
    honours = JSON.parse(readFileSync('src/config/honours.json', 'utf8'))
  } catch (err) {
    console.error(`Cannot read src/config/honours.json: ${err.message}`)
    process.exit(1)
  }

  for (const entry of honours) {
    if (!MANAGER_KEYS.includes(entry.key)) {
      problems.push(`honours.json: "${entry.key}" (${entry.season}) is not one of the eleven manager keys`)
    }
    // honours.json names a source file such as "dj.png"; we serve the
    // optimised output, so check the stem against what the pipeline emits.
    const stem = entry.image.replace(/\.[^.]+$/, '').toLowerCase()
    for (const format of FORMATS) {
      const file = path.join(OUT_DIR, 'winner', `${stem}.${format}`)
      checked++
      if (!(await exists(file))) {
        problems.push(`missing ${file} — required by honours.json entry for ${entry.season}`)
      }
    }
  }

  for (const file of ['premier-league-logo.png', 'player-silhouette.svg', 'badge-placeholder.svg']) {
    checked++
    if (!(await exists(path.join(OUT_DIR, file)))) problems.push(`missing ${path.join(OUT_DIR, file)}`)
  }

  if (problems.length > 0) {
    console.error(`\nImage check FAILED — ${problems.length} problem(s):\n`)
    for (const p of problems) console.error(`  ✗ ${p}`)
    console.error(`\nRun \`npm run images\` to regenerate from assets-src/.\n`)
    process.exit(1)
  }

  console.log(
    `Image check passed: ${checked} files present ` +
      `(${MANAGER_KEYS.length}×${MANAGER_SETS.length} manager images, ${honours.length} winner card(s)).`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
