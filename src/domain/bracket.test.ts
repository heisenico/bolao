import { describe, it, expect } from 'vitest'
import { buildBracket, KNOCKOUT_PHASES } from './bracket'
import type { BracketMatch } from './bracket'

function m(over: Partial<BracketMatch>): BracketMatch {
  return {
    id: over.id ?? 'x',
    fase: over.fase ?? 'r32',
    dataHora: over.dataHora ?? new Date('2026-07-01T18:00:00Z'),
    homeNome: over.homeNome ?? 'A',
    awayNome: over.awayNome ?? 'B',
    homeCodigoPais: over.homeCodigoPais ?? 'AA',
    awayCodigoPais: over.awayCodigoPais ?? 'BB',
    placarHome: over.placarHome ?? null,
    placarAway: over.placarAway ?? null,
  }
}

describe('KNOCKOUT_PHASES', () => {
  it('lists knockout phases in order from r32 to final (no grupos)', () => {
    expect(KNOCKOUT_PHASES).toEqual(['r32', 'oitavas', 'quartas', 'semi', 'terceiro', 'final'])
  })
})

describe('buildBracket', () => {
  it('drops group-stage matches and keeps only knockout phases', () => {
    const cols = buildBracket([
      m({ id: 'g1', fase: 'grupos' }),
      m({ id: 'k1', fase: 'r32' }),
    ])
    const ids = cols.flatMap((c) => c.matches.map((x) => x.id))
    expect(ids).toContain('k1')
    expect(ids).not.toContain('g1')
  })

  it('returns one column per knockout phase, ordered r32..final', () => {
    const cols = buildBracket([
      m({ id: 'f', fase: 'final' }),
      m({ id: 'r', fase: 'r32' }),
      m({ id: 'q', fase: 'quartas' }),
    ])
    expect(cols.map((c) => c.fase)).toEqual(['r32', 'oitavas', 'quartas', 'semi', 'terceiro', 'final'])
    expect(cols.find((c) => c.fase === 'r32')!.matches.map((x) => x.id)).toEqual(['r'])
    expect(cols.find((c) => c.fase === 'oitavas')!.matches).toEqual([])
    expect(cols.find((c) => c.fase === 'final')!.matches.map((x) => x.id)).toEqual(['f'])
  })

  it('sorts matches within a phase by dataHora ascending', () => {
    const cols = buildBracket([
      m({ id: 'late', fase: 'r32', dataHora: new Date('2026-07-02T18:00:00Z') }),
      m({ id: 'early', fase: 'r32', dataHora: new Date('2026-07-01T18:00:00Z') }),
    ])
    expect(cols.find((c) => c.fase === 'r32')!.matches.map((x) => x.id)).toEqual(['early', 'late'])
  })
})
