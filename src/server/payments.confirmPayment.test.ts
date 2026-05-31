import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { confirmPayment } from '@/server/payments'

async function fixture() {
  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}@test.com`, name: 'Admin' },
  })
  const player = await prisma.user.create({
    data: { email: `player-${Date.now()}@test.com`, name: 'Player' },
  })
  const pool = await prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}`,
      ownerId: admin.id,
      valorEntrada: 2500,
      chavePix: 'pix@test.com',
    },
  })
  const membership = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: player.id, paymentStatus: 'pago' },
  })
  return { admin, player, pool, membership }
}

describe('confirmPayment', () => {
  it('flips membership to confirmado and stamps confirmadoPor/confirmadoEm', async () => {
    const { admin, membership, pool } = await fixture()

    await confirmPayment(membership.id, admin.id)

    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: membership.id } })
    expect(m.paymentStatus).toBe('confirmado')

    const rec = await prisma.paymentRecord.findFirstOrThrow({
      where: { membershipId: membership.id },
    })
    expect(rec.confirmadoPor).toBe(admin.id)
    expect(rec.confirmadoEm).toBeInstanceOf(Date)
    expect(rec.valor).toBe(pool.valorEntrada)
    expect(rec.metodo).toBe('PIX')
  })

  it('is idempotent: confirming twice keeps confirmado and a single record', async () => {
    const { admin, membership } = await fixture()

    await confirmPayment(membership.id, admin.id)
    await confirmPayment(membership.id, admin.id)

    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: membership.id } })
    expect(m.paymentStatus).toBe('confirmado')

    const count = await prisma.paymentRecord.count({ where: { membershipId: membership.id } })
    expect(count).toBe(1)
  })
})
