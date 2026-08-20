/**
 * Find characters in user-facing copy, ignoring code comments.
 *
 * Used by the em dash test and by a one-off finder. The distinction that
 * matters is comment versus not: an em dash is fine in a comment explaining
 * something to the next developer, and not fine in a string or a piece of JSX
 * text that a reader of the site will see.
 *
 * This walks the source tracking whether it is inside a string, a template
 * literal, a line comment or a block comment, which is enough for our code.
 * A full parser would be more correct and much more machinery than the job
 * needs.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/** Replaces every comment with spaces, preserving offsets so lines still line up. */
export function stripComments(source) {
  const out = source.split('')
  let i = 0
  const blank = (from, to) => {
    for (let j = from; j < to; j++) if (out[j] !== '\n') out[j] = ' '
  }

  while (i < source.length) {
    const two = source.slice(i, i + 2)

    if (two === '//') {
      const end = source.indexOf('\n', i)
      blank(i, end === -1 ? source.length : end)
      i = end === -1 ? source.length : end
      continue
    }

    if (two === '/*') {
      const end = source.indexOf('*/', i + 2)
      blank(i, end === -1 ? source.length : end + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }

    const char = source[i]
    if (char === '"' || char === "'" || char === '`') {
      // Skip the string body so a // or /* inside it is not treated as a comment.
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === char) {
          i++
          break
        }
        i++
      }
      continue
    }

    // A regex literal can contain a slash pair; skipping it wholesale is
    // simpler than deciding whether `/` starts a regex or is division.
    i++
  }

  return out.join('')
}

export function sourceFiles(dir, extensions = ['.ts', '.tsx']) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full, extensions)
    const isSource = extensions.some((ext) => entry.endsWith(ext))
    return isSource && !entry.includes('.test.') ? [full] : []
  })
}

/** Every line of user-facing copy in `dir` containing `character`. */
export function findInCopy(dir, character) {
  const hits = []
  for (const file of sourceFiles(dir)) {
    const stripped = stripComments(readFileSync(file, 'utf8'))
    stripped.split('\n').forEach((line, index) => {
      if (line.includes(character)) hits.push({ file, line: index + 1, text: line.trim() })
    })
  }
  return hits
}
