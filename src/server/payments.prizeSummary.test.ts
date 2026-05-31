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
) {
  const user = await prisma.user.create({
    data: { email: `${nome}-${Date.now()}-${Math.random()}@test.com`, name: nome },
  })
  return prisma.poolMembership.create({
    data: { poolId, userId: user.id, paymentStatus },
  })
}

describe('prizeSummary', () => {
  it('total = confirmed entries * valorEntrada; winner = top of ranking', async () => {
    const p = await pool(2500)
    const admin = await prisma.user.findFirstOrThrow({ where: { id: p.ownerId } })
    const leader = await member(p.id, 'Leader', 'pendente')
    const second = await member(p.id, 'Second', 'pendente')
    await member(p.id, 'Zé', 'pendente')

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
    // leader nails it (3), second gets winner-only (1)
    await prisma.prediction.create({
      data: { membershipId: leader.id, matchId: match.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 },
    })
    await prisma.prediction.create({
      data: { membershipId: second.id, matchId: match.id, palpiteHome: 3, palpiteAway: 0, pontosObtidos: 1 },
    })

    const summary = await prizeSummary(p.id)

    expect(summary.total).toBe(5000)
    expect(summary.winner?.membershipId).toBe(leader.id)
    expect(summary.winner?.nome).toBe('Leader')
  })

  it('winner is null and total 0 when the pool has no members', async () => {
    const p = await pool(2500)
    const summary = await prizeSummary(p.id)
    expect(summary.total).toBe(0)
    expect(summary.winner).toBeNull()
  })
})
