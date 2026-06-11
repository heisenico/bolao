import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  confirmPayment,
  markPaid,
  revertPaymentToPending,
} from '@/server/payments'
import { OwnershipError } from '@/server/admin'

let adminId: string
let memberId: string // membershipId of a regular (non-owner) member

beforeEach(async () => {
  const owner = await prisma.user.create({
    data: { email: `pf-o-${Date.now()}-${Math.random()}@t.test` },
  })
  adminId = owner.id
  const pool = await prisma.pool.create({
    data: {
      nome: 'P',
      inviteCode: `c${Math.random()}`,
      ownerId: owner.id,
      valorEntrada: 2500,
      chavePix: 'pix@t',
    },
  })
  const member = await prisma.user.create({
    data: { email: `pf-m-${Date.now()}-${Math.random()}@t.test` },
  })
  memberId = (
    await prisma.poolMembership.create({ data: { poolId: pool.id, userId: member.id } })
  ).id
})

describe('markPaid transitions', () => {
  it('pendente -> pago, stamping pagamentoReportadoEm', async () => {
    const before = Date.now()
    const m = await markPaid(memberId)
    expect(m.paymentStatus).toBe('pago')
    expect(m.pagamentoReportadoEm).toBeInstanceOf(Date)
    expect((m.pagamentoReportadoEm as Date).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('is a no-op on an already-pago membership (keeps the first timestamp)', async () => {
    const first = await markPaid(memberId)
    const second = await markPaid(memberId)
    expect(second.paymentStatus).toBe('pago')
    expect(second.pagamentoReportadoEm?.getTime()).toBe(first.pagamentoReportadoEm?.getTime())
  })

  it('never downgrades a confirmado membership', async () => {
    await markPaid(memberId)
    await confirmPayment(memberId, adminId)
    const after = await markPaid(memberId)
    expect(after.paymentStatus).toBe('confirmado')
  })
})

describe('revertPaymentToPending ("marcar como não pago")', () => {
  it('reverts a pago report and clears the timestamp', async () => {
    await markPaid(memberId)
    await revertPaymentToPending(memberId, adminId)

    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: memberId } })
    expect(m.paymentStatus).toBe('pendente')
    expect(m.pagamentoReportadoEm).toBeNull()
  })

  it('reverts a confirmado membership and deletes its PaymentRecord', async () => {
    await markPaid(memberId)
    await confirmPayment(memberId, adminId)
    expect(await prisma.paymentRecord.count({ where: { membershipId: memberId } })).toBe(1)

    await revertPaymentToPending(memberId, adminId)

    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: memberId } })
    expect(m.paymentStatus).toBe('pendente')
    expect(await prisma.paymentRecord.count({ where: { membershipId: memberId } })).toBe(0)
  })

  it('rejects a non-owner', async () => {
    const stranger = await prisma.user.create({
      data: { email: `pf-s-${Date.now()}-${Math.random()}@t.test` },
    })
    await markPaid(memberId)
    await expect(revertPaymentToPending(memberId, stranger.id)).rejects.toBeInstanceOf(
      OwnershipError,
    )
    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: memberId } })
    expect(m.paymentStatus).toBe('pago')
  })
})
