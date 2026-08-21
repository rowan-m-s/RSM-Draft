import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The theme rules from Addendum 05, as tests.
 *
 * Two things are enforced. First, contrast: on aubergine the bright cyan and
 * green are legible as text, muted white stays comfortably readable on every
 * surface, and the brighter pink clears the background. Second, discipline:
 * every colour in the app comes from the token block in index.css, so a
 * re-theme is a one-file change. A hex, an rgb() or a stock Tailwind colour
 * anywhere else fails here.
 */

const TOKENS = {
  'pl-bg': '#1E0021',
  'pl-surface': '#28002B',
  'pl-surface-2': '#33003A',
  'pl-text': '#FFFFFF',
  'pl-cyan': '#04F5FF',
  'pl-violet': '#963CFF',
  'pl-pink': '#FF2882',
  'pl-green': '#00FF87',
  'pl-amber': '#FFC233',
  'pl-red': '#FF3B3B',
}

const MUTED_ALPHA = 0.65

type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgb) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** White at alpha over a surface, which is what `--color-pl-muted` renders as. */
function mutedOn(surface: Rgb): Rgb {
  return surface.map((c) => Math.round(255 * MUTED_ALPHA + c * (1 - MUTED_ALPHA))) as Rgb
}

const SURFACES = ['pl-bg', 'pl-surface', 'pl-surface-2'] as const

describe('palette contrast', () => {
  it('keeps white and muted white above 4.5:1 on every surface', () => {
    for (const surface of SURFACES) {
      const bg = rgb(TOKENS[surface])
      expect(contrast(rgb(TOKENS['pl-text']), bg)).toBeGreaterThanOrEqual(4.5)
      const muted = contrast(mutedOn(bg), bg)
      expect(muted, `muted on ${surface} is ${muted.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('confirms cyan and green are legible as text on aubergine, so there are no -ink variants', () => {
    for (const token of ['pl-cyan', 'pl-green'] as const) {
      for (const surface of SURFACES) {
        const ratio = contrast(rgb(TOKENS[token]), rgb(TOKENS[surface]))
        expect(ratio, `${token} on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('records why the pink changed from #E90052 to #FF2882', () => {
    // The old pink is close in value to the aubergine and measured 3.87:1 on
    // it. The new one clears 4.5:1 on the background; on the card surface it
    // lands at 4.46:1, which is why pink text on cards is always bold or large.
    const bg = rgb(TOKENS['pl-bg'])
    expect(contrast(rgb('#E90052'), bg)).toBeLessThan(4.5)
    expect(contrast(rgb(TOKENS['pl-pink']), bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgb(TOKENS['pl-pink']), rgb(TOKENS['pl-surface']))).toBeGreaterThanOrEqual(3)
    expect(contrast(rgb(TOKENS['pl-pink']), rgb(TOKENS['pl-surface-2']))).toBeGreaterThanOrEqual(3)
  })

  it('keeps aubergine text legible on the filled badges and buttons', () => {
    const ink = rgb(TOKENS['pl-bg'])
    for (const fill of ['pl-cyan', 'pl-green', 'pl-pink', 'pl-text'] as const) {
      const ratio = contrast(ink, rgb(TOKENS[fill]))
      expect(ratio, `bg on ${fill} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('matches the hexes declared in index.css', () => {
    const css = readFileSync('src/index.css', 'utf8')
    for (const [token, hex] of Object.entries(TOKENS)) {
      expect(css, `--color-${token}`).toContain(`--color-${token}: ${hex.toLowerCase()}`)
    }
    expect(css).toContain(`--color-pl-muted: rgba(255, 255, 255, ${MUTED_ALPHA})`)
  })

  it('keeps the browser chrome the same colour as the page', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain(`<meta name="theme-color" content="${TOKENS['pl-bg']}" />`)
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !entry.endsWith('.test.ts') ? [full] : []
  })
}

/** Lines of index.css inside the `@theme { ... }` block, where colours live. */
function themeBlockLines(css: string): Set<number> {
  const lines = css.split('\n')
  const start = lines.findIndex((line) => line.startsWith('@theme {'))
  const end = lines.findIndex((line, i) => i > start && line === '}')
  return new Set(Array.from({ length: end - start + 1 }, (_, i) => start + i + 1))
}

describe('every colour comes from a token', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/
  const FUNCTIONAL = /\b(rgba?|hsla?|oklch|oklab)\(\s*[\d.#]/
  const STOCK_TAILWIND =
    /(?<![\w-])(bg|text|border|from|via|to|ring|fill|stroke|outline|shadow|decoration|accent|divide|placeholder)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d+)?(\/\d+)?\b/

  it('finds no hex, rgb() or stock Tailwind colour outside the @theme block', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8')
      const allowed = file.endsWith('index.css') ? themeBlockLines(text) : new Set<number>()
      text.split('\n').forEach((line, i) => {
        if (allowed.has(i + 1)) return
        if (HEX.test(line) || FUNCTIONAL.test(line) || STOCK_TAILWIND.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim()}`)
        }
      })
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('reserves pink for Koch and negative balances', () => {
    // Every file that mentions pink, so a new one is a prompt to ask why.
    const files = sourceFiles('src')
      .filter((file) => /\bpl-pink\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative('src', file))
      .sort()
    expect(files).toEqual([
      'components/Layout.tsx', // last place accent, banner strip, sidebar mark
      'components/PlayerFlag.tsx', // the red availability flag
      'index.css', // the banner strip
      'pages/Home.tsx', // Koch of the week card
      'pages/Honours.tsx', // Koch cards
      'pages/LeagueTable.tsx', // Koch row and the £5 charged
      'pages/Managers.tsx', // negative balances
      'pages/Squad.tsx', // the points strip when this manager was Koch
    ])
  })
})
