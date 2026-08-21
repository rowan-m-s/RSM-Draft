import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BADGE_PLACEHOLDER_SVG,
  MANAGER_KEYS,
  MANAGER_SETS,
  PLAYER_SILHOUETTE_SVG,
  classifySourceFile,
  parseSourceName,
} from './images.shared.mjs'

describe('parseSourceName', () => {
  it('accepts either extension for the same key and type', () => {
    // Icons arrived as .jpg and the cards as .png. Matching the extension
    // strictly would report all eleven icons as missing.
    expect(parseSourceName('kellett.icon.jpg')).toMatchObject({ key: 'kellett', set: 'icon' })
    expect(parseSourceName('rowan.icon.png')).toMatchObject({ key: 'rowan', set: 'icon' })
    expect(parseSourceName('rowan.icon.jpeg')).toMatchObject({ key: 'rowan', set: 'icon' })
    expect(parseSourceName('rowan.icon.webp')).toMatchObject({ key: 'rowan', set: 'icon' })
  })

  it('lowercases the key and the type', () => {
    expect(parseSourceName('DJ.winner.png')).toMatchObject({ key: 'dj', set: 'winner' })
    expect(parseSourceName('Rushy.Winner.png')).toMatchObject({ key: 'rushy', set: 'winner' })
  })

  it('returns null for anything that is not a manager asset', () => {
    expect(parseSourceName('IMG_2093.jpg')).toBeNull()
    expect(parseSourceName('PremierLeagueLogo.png')).toBeNull()
    expect(parseSourceName('rushy.icon.txt')).toBeNull()
    expect(parseSourceName('rushy.png')).toBeNull()
  })
})

describe('classifySourceFile', () => {
  it('recognises every real manager asset', () => {
    for (const key of MANAGER_KEYS) {
      for (const set of MANAGER_SETS) {
        expect(classifySourceFile(`${key}.${set}.png`)).toMatchObject({ status: 'asset', key, set })
      }
    }
  })

  it('names the non-manager files that legitimately live in the folder', () => {
    for (const name of ['IMG_2093.jpg', 'IMG_2094.jpg', 'PremierLeagueLogo.png']) {
      const result = classifySourceFile(name)
      expect(result.status).toBe('known-other')
      expect(result.reason).toBeTruthy()
    }
  })

  it('gives a reason for anything it skips', () => {
    // The reason is the whole point: without it a typo looks exactly like a
    // deliberate exclusion.
    const result = classifySourceFile('holiday-snap.jpg')
    expect(result.status).toBe('ignored')
    expect(result.reason).toContain('does not match')
  })

  it('treats a misspelled key as an error, not a skip, and suggests the fix', () => {
    const result = classifySourceFile('rushi.icon.jpg')
    expect(result.status).toBe('unknown-key')
    expect(result.reason).toContain('Did you mean "rushy"')
  })

  it('does not offer a wild suggestion for a key that resembles nothing', () => {
    const result = classifySourceFile('christopher.koch.png')
    expect(result.status).toBe('unknown-key')
    expect(result.reason).not.toContain('Did you mean')
  })

  it('ignores OS clutter without reporting it', () => {
    expect(classifySourceFile('.DS_Store').status).toBe('noise')
  })
})

describe('the placeholders the optimiser writes', () => {
  it('are drawn in white at the token alphas, never in a grey of their own', () => {
    for (const svg of [PLAYER_SILHOUETTE_SVG, BADGE_PLACEHOLDER_SVG]) {
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}/)
      expect(svg).toContain('white')
      expect(svg).toContain('opacity=".1"')
      expect(svg).toContain('opacity=".35"')
    }
  })

  it('match the files in public/images, so a run of the optimiser cannot revert them', () => {
    expect(readFileSync('public/images/player-silhouette.svg', 'utf8')).toBe(PLAYER_SILHOUETTE_SVG)
    expect(readFileSync('public/images/badge-placeholder.svg', 'utf8')).toBe(BADGE_PLACEHOLDER_SVG)
  })
})
