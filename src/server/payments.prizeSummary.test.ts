import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { confirmPayment, prizeSummary } from '@/server/payments'

async function pool(valorEntrada = 2500) {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.com`, name: 'Owner' },
  })
  return prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}-${Math.random()}`,
      ownerId: owner.id,
      valorEntrada,
      chavePix: 'pix@test.com',
    },
  })
}

async function member(
  poolId: string,
  nome: string,
  paymentStatus: 'pendente' | 'pago' | 'confirmado',
  opts: { isAi?: boolean } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `${nome}-${Date.now()}-${Math.random()}@test.com`,
      name: nome,
      isAi: opts.isAi ?? false,
    },
  })
  return prisma.poolMembership.create({
    data: { poolId, userId: user.id, paymentStatus },
  })
}

describe('prizeSummary', () => {
  it('total = confirmed entries * valorEntrada; top humans split 60/30/10', async () => {
    const p = await pool(2500)
    const admin = await prisma.user.findFirstOrThrow({ where: { id: p.ownerId } })
    const leader = await member(p.id, 'Leader', 'pendente')
    const second = await member(p.id, 'Second', 'pendente')
    const third = await member(p.id, 'Ze', 'pendente')

    // confirm 2 of 3 entries -> total = 2 * 2500 = 5000
    await confirmPayment(leader.id, admin.id)
    await confirmPayment(second.id, admin.id)

    // build a team + finished match so standings have points
    const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
    const away = await prisma.team.create({ data: { nome: 'Franca', codigoPais: 'FR' } })
    const match = await prisma.match.create({
      data: {
        fase: 'final',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-07-19T18:00:00Z'),
        placarHome: 2,
        placarAway: 1,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
    })
    // leader nails it, second gets winner-only (values post-multiplier, fase final 3x)
    await prisma.prediction.create({
      data: {
        membershipId: leader.id,
        matchId: match.id,
        palpiteHome: 2,
        palpiteAway: 1,
        pontosObtidos: 30,
        pontosBase: 10,
        hitType: 'exact',
      },
    })
    await prisma.prediction.create({
      data: {
        membershipId: second.id,
        matchId: match.id,
        palpiteHome: 3,
        palpiteAway: 0,
        pontosObtidos: 9,
        pontosBase: 3,
        hitType: 'winner_only',
      },
    })

    const summary = await prizeSummary(p.id)

    expect(summary.total).toBe(5000)
    // Pools here are created bare (no owner membership), so the 3 members
    // above are the whole standings.
    expect(summary.winners.map((w) => [w.membershipId, w.humanPrizeRank, w.prizePct])).toEqual([
      [leader.id, 1, 60],
      [second.id, 2, 30],
      [third.id, 3, 10],
    ])
  })

  it('AI members rank but never take a prize share (cascade past them)', async () => {
    const p = await pool(1000)
    const ai = await member(p.id, 'Claude', 'pendente', { isAi: true })
    const h1 = await member(p.id, 'Lucca', 'pendente')
    const h2 = await member(p.id, 'Joao', 'pendente')
    const h3 = await member(p.id, 'Maria', 'pendente')

    const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
    const away = await prisma.team.create({ data: { nome: 'Franca', codigoPais: 'FR' } })
    const match = await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-06-12T18:00:00Z'),
        placarHome: 2,
        placarAway: 1,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
    })
    // AI tops the ranking; humans follow.
    const mk = (membershipId: string, pontos: number, hitType: 'exact' | 'winner_only') =>
      prisma.prediction.create({
        data: {
          membershipId,
          matchId: match.id,
          palpiteHome: 2,
          palpiteAway: 1,
          pontosObtidos: pontos,
          pontosBase: pontos,
          hitType,
        },
      })
    await mk(ai.id, 10, 'exact')
    await mk(h1.id, 5, 'winner_only')
    await mk(h2.id, 3, 'winner_only')

    const summary = await prizeSummary(p.id)

    expect(summary.winners.map((w) => [w.membershipId, w.overallRank, w.prizePct])).toEqual([
      [h1.id, 2, 60],
      [h2.id, 3, 30],
      [h3.id, 4, 10],
    ])
  })

  it('winners is empty and total 0 when the pool has no members', async () => {
    const p = await pool(2500)
    const summary = await prizeSummary(p.id)
    expect(summary.total).toBe(0)
    expect(summary.winners).toEqual([])
  })
})
