import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The contrast rules from the brief, as tests.
 *
 * #00FF87 and #04F5FF are near-invisible on white — about 1.4:1 and 1.5:1
 * against the 4.5:1 that body text needs. They are fills only. The `-ink`
 * variants are the text-safe substitutes, and the bright originals are allowed
 * on the purple banner.
 */

const PALETTE = {
  'pl-purple': '#37003C',
  'pl-navy': '#1B1B3A',
  'pl-white': '#FFFFFF',
  'pl-off': '#F7F7F9',
  'pl-border': '#E5E5EB',
  'pl-pink': '#E90052',
  'pl-green': '#00FF87',
  'pl-green-ink': '#008040',
  'pl-cyan': '#04F5FF',
  'pl-cyan-ink': '#007A8A',
  'pl-muted': '#6B6B7B',
}

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  )
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('palette contrast', () => {
  it('keeps every text-on-white colour above 4.5:1', () => {
    for (const token of ['pl-navy', 'pl-purple', 'pl-pink', 'pl-muted', 'pl-green-ink', 'pl-cyan-ink'] as const) {
      const ratio = contrast(PALETTE[token], PALETTE['pl-white'])
      expect(ratio, `${token} on white is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('confirms the bright green and cyan are unusable as text on white', () => {
    // Not a wish — a fact about these two hexes. If either ever passes, the
    // palette has been changed and the fill-only rule needs revisiting.
    expect(contrast(PALETTE['pl-green'], PALETTE['pl-white'])).toBeLessThan(2)
    expect(contrast(PALETTE['pl-cyan'], PALETTE['pl-white'])).toBeLessThan(2)
  })

  it('records why the -ink variants differ from the brief', () => {
    // The brief specified #00A550 and #0090A8. Both fall under 4.5:1 on white
    // (3.23 and 3.78), which defeats the point of having them. These two pass.
    expect(contrast('#00A550', PALETTE['pl-white'])).toBeLessThan(4.5)
    expect(contrast('#0090A8', PALETTE['pl-white'])).toBeLessThan(4.5)
  })

  it('keeps the bright green and cyan legible on the purple banner', () => {
    for (const token of ['pl-green', 'pl-cyan'] as const) {
      const ratio = contrast(PALETTE[token], PALETTE['pl-purple'])
      expect(ratio, `${token} on purple is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('matches the hexes declared in index.css', () => {
    const css = readFileSync('src/index.css', 'utf8')
    for (const [token, hex] of Object.entries(PALETTE)) {
      expect(css, `--color-${token}`).toContain(`--color-${token}: ${hex.toLowerCase()}`)
    }
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') ? [full] : []
  })
}

describe('bright green and cyan are never used as text on a light surface', () => {
  // A className that reaches for `text-pl-cyan` while also setting a white or
  // off-white background is the exact mistake the rule exists to prevent.
  const LIGHT_SURFACE = /\b(bg-pl-white|bg-pl-off|\bcard\b)/
  const BRIGHT_TEXT = /\btext-pl-(cyan|green)\b(?!-ink)/

  it('finds no className combining bright text with a light background', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (BRIGHT_TEXT.test(line) && LIGHT_SURFACE.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('documents every remaining bright-text use, which must sit on the banner', () => {
    const uses: string[] = []
    for (const file of sourceFiles('src')) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (BRIGHT_TEXT.test(line)) uses.push(`${path.basename(file)}:${i + 1}`)
        })
    }
    // Each of these was checked by eye to be inside a purple gradient banner.
    // A new entry appearing here is a prompt to check the same thing, not a
    // failure — but the count is pinned so it cannot grow unnoticed.
    expect(uses.length, `bright-text uses:\n${uses.join('\n')}`).toBeLessThanOrEqual(4)
  })
})
