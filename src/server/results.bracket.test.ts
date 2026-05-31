import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getKnockoutMatches } from '@/server/results'

async function team(nome: string, codigoPais: string) {
  return prisma.team.create({ data: { nome, codigoPais } })
}

describe('getKnockoutMatches', () => {
  it('returns only knockout matches mapped to BracketMatch shape', async () => {
    const a = await team('Brasil', 'BR')
    const b = await team('Croacia', 'HR')
    const c = await team('Espanha', 'ES')
    const d = await team('Italia', 'IT')

    await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: a.id,
        awayTeamId: b.id,
        dataHora: new Date('2026-06-12T18:00:00Z'),
      },
    })
    const ko = await prisma.match.create({
      data: {
        fase: 'r32',
        homeTeamId: c.id,
        awayTeamId: d.id,
        dataHora: new Date('2026-07-01T18:00:00Z'),
        placarHome: 1,
        placarAway: 0,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
    })

    const rows = await getKnockoutMatches()

    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(ko.id)
    expect(rows[0].fase).toBe('r32')
    expect(rows[0].homeNome).toBe('Espanha')
    expect(rows[0].awayNome).toBe('Italia')
    expect(rows[0].homeCodigoPais).toBe('ES')
    expect(rows[0].placarHome).toBe(1)
    expect(rows[0].placarAway).toBe(0)
    expect(rows[0].dataHora).toBeInstanceOf(Date)
  })
})
