import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain JS helper shared with the image scripts.
import { findInCopy, stripComments } from '../../scripts/lib/scan-copy.mjs'

/**
 * Em dashes are not used in anything the reader sees.
 *
 * The scan strips comments first, so an em dash in a comment explaining
 * something to the next developer is fine. What it catches is one that has
 * crept into a string literal or a piece of JSX text along with a new feature,
 * which is exactly how they come back.
 */
describe('user-facing copy', () => {
  it('contains no em dashes', () => {
    const hits = findInCopy('src', '—') as { file: string; line: number; text: string }[]
    const report = hits.map((hit) => `\n  ${hit.file}:${hit.line}  ${hit.text}`).join('')
    expect(hits, `Rewrite the sentence rather than swapping in a hyphen.${report}`).toEqual([])
  })

  it('contains no en dashes used as punctuation', () => {
    // Numeric ranges are fine; an en dash surrounded by spaces is punctuation.
    const hits = (findInCopy('src', ' – ') as { file: string; line: number; text: string }[]) ?? []
    expect(hits).toEqual([])
  })
})

describe('placeholders', () => {
  it('never uses a lone dash as an empty value', () => {
    // A cell that has nothing to say is left blank. A '–' or '—' on its own
    // in every row reads as a stray character rather than an empty state,
    // and the punctuation rules above do not catch it because it is not
    // surrounded by text.
    const hits = [
      ...(findInCopy('src', "'–'") as { file: string; line: number; text: string }[]),
      ...(findInCopy('src', "'—'") as { file: string; line: number; text: string }[]),
    ]
    const report = hits.map((hit) => `\n  ${hit.file}:${hit.line}  ${hit.text}`).join('')
    expect(hits, `Leave the cell empty instead.${report}`).toEqual([])
  })
})

describe('the scanner itself', () => {
  it('ignores line comments', () => {
    expect(stripComments('const a = 1 // an em dash — here\n')).not.toContain('—')
  })

  it('ignores block and JSX comments', () => {
    expect(stripComments('/* an em dash — here */ const a = 1')).not.toContain('—')
    expect(stripComments('<p>{/* — */}hello</p>')).not.toContain('—')
  })

  it('keeps strings and JSX text, including a // inside a string', () => {
    expect(stripComments('const url = "https://example.com" // note —')).toContain('https://example.com')
    expect(stripComments('<p>Not settled — running</p>')).toContain('—')
    expect(stripComments('const s = `a — b`')).toContain('—')
  })

  it('preserves line numbers so the report points at the right place', () => {
    const stripped = stripComments('line one\n// comment\nline three —\n')
    expect(stripped.split('\n')[2]).toContain('—')
  })
})
