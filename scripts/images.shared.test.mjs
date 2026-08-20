import { describe, expect, it } from 'vitest'
import { MANAGER_KEYS, MANAGER_SETS, classifySourceFile, parseSourceName } from './images.shared.mjs'

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
