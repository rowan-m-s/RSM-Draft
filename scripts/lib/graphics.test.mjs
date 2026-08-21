import { describe, expect, it } from 'vitest'
import { kochVariant, pickGraphic, resolvePlayerName } from './graphics.mjs'

const squad = [
  { code: 1, webName: "O'Reilly", firstName: 'Nico', secondName: "O'Reilly" },
  { code: 2, webName: 'Gyökeres', firstName: 'Viktor', secondName: 'Gyökeres' },
  { code: 3, webName: 'João Pedro', firstName: 'João Pedro', secondName: 'Junqueira de Jesus' },
  { code: 4, webName: 'B.Fernandes', firstName: 'Bruno', secondName: 'Borges Fernandes' },
  { code: 5, webName: 'Fernandes', firstName: 'Pedro', secondName: 'Fernandes' },
  { code: 6, webName: 'Virgil', firstName: 'Virgil', secondName: 'van Dijk' },
]

describe('resolvePlayerName', () => {
  it('resolves through diacritics, punctuation and run-together names', () => {
    expect(resolvePlayerName({ name: 'O_Reilly', candidates: squad }).player.code).toBe(1)
    expect(resolvePlayerName({ name: 'Gyokeres', candidates: squad }).player.code).toBe(2)
    expect(resolvePlayerName({ name: 'JoãoPedro', candidates: squad }).player.code).toBe(3)
    expect(resolvePlayerName({ name: 'VanDijk', candidates: squad }).player.code).toBe(6)
    // The last word of a multi-part surname, alone in a squad, resolves.
    const alone = squad.filter((p) => p.code !== 5)
    expect(resolvePlayerName({ name: 'Fernandes', candidates: alone }).player.code).toBe(4)
    expect(resolvePlayerName({ name: 'BFernandes', candidates: alone }).player.code).toBe(4)
  })

  it('reports rather than guesses when a name misses or hits twice', () => {
    expect(resolvePlayerName({ name: 'O_Reily', candidates: squad }).status).toBe('unresolved')
    // Two Fernandes in one squad: "Fernandes" is the web name of one and the
    // surname of the other, so it is ambiguous and must be said.
    const both = resolvePlayerName({ name: 'Fernandes', candidates: squad })
    expect(both.status).toBe('ambiguous')
    expect(both.players.map((p) => p.code).sort()).toEqual([4, 5])
  })
})

describe('pickGraphic', () => {
  const candidates = [
    { code: 10, surname: 'Saka' },
    { code: 11, surname: 'Cunha' },
    { code: 12, surname: 'van Dijk' },
  ]

  it('picks the top scorer for this manager among owned candidates', () => {
    const pick = pickGraphic({ candidates, pointsByCode: { 10: 20, 11: 35, 12: 35 }, ownedCodes: new Set([10, 11, 12]) })
    // 11 and 12 tie on 35: Cunha sorts before van Dijk.
    expect(pick).toEqual({ code: 11, points: 35 })
  })

  it('breaks an all-zero tie alphabetically, never randomly', () => {
    const pick = pickGraphic({ candidates, pointsByCode: {}, ownedCodes: new Set([10, 11, 12]) })
    expect(pick).toEqual({ code: 11, points: 0 })
  })

  it('excludes players the manager no longer owns, and is null if none are left', () => {
    expect(pickGraphic({ candidates, pointsByCode: { 11: 99 }, ownedCodes: new Set([10]) })).toEqual({ code: 10, points: 0 })
    expect(pickGraphic({ candidates, pointsByCode: { 11: 99 }, ownedCodes: new Set() })).toBeNull()
  })
})

describe('kochVariant', () => {
  it('alternates from the first award', () => {
    expect([0, 1, 2, 3].map(kochVariant)).toEqual(['koch', 'koch2', 'koch', 'koch2'])
  })
})
