import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getMatchesForAdmin } from '@/server/results'

async function team(nome: string, codigoPais: string, bandeira?: string) {
  return prisma.team.create({ data: { nome, codigoPais, bandeira } })
}

describe('getMatchesForAdmin', () => {
  it('returns group-stage AND knockout matches, ordered by dataHora asc', async () => {
    const a = await team('Mexico', 'MX')
    const b = await team('Canada', 'CA')
    const c = await team('Espanha', 'ES')
    const d = await team('Italia', 'IT')

    // r32 kicks off LATER than the group match, so a correct ordering puts the
    // group-stage match first regardless of creation order (created KO first).
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
    const grupo = await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: a.id,
        awayTeamId: b.id,
        dataHora: new Date('2026-06-12T18:00:00Z'),
      },
    })

    const rows = await getMatchesForAdmin()

    // The whole point of the fix: group-stage matches must be selectable in the
    // admin manual-result/cancel forms, not just knockout matches.
    expect(rows.map((r) => r.id)).toEqual([grupo.id, ko.id])

    const [first, second] = rows
    expect(first.id).toBe(grupo.id)
    expect(first.fase).toBe('grupos')
    expect(first.homeNome).toBe('Mexico')
    expect(first.awayNome).toBe('Canada')
    expect(first.homeCodigoPais).toBe('MX')
    expect(first.awayCodigoPais).toBe('CA')
    expect(first.status).toBe('agendada')
    expect(first.placarHome).toBeNull()
    expect(first.placarAway).toBeNull()
    expect(first.dataHora).toBeInstanceOf(Date)

    expect(second.id).toBe(ko.id)
    expect(second.fase).toBe('r32')
    expect(second.status).toBe('encerrada')
    expect(second.placarHome).toBe(1)
    expect(second.placarAway).toBe(0)
  })
})
