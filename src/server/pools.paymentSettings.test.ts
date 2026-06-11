import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  BlockAClosedError,
  createPool,
  updatePoolPaymentSettings,
} from '@/server/pools'

async function makeOwner() {
  return prisma.user.create({
    data: { email: `ps-${Date.now()}-${Math.random()}@t.test` },
  })
}

async function seedOpeningMatch(kickoff: Date) {
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
  const away = await prisma.team.create({ data: { nome: 'Franca', codigoPais: 'FR' } })
  return prisma.match.create({
    data: { fase: 'grupos', homeTeamId: home.id, awayTeamId: away.id, dataHora: kickoff },
  })
}

describe('createPool payment settings', () => {
  it("creator's own membership starts confirmado (they never pay themself)", async () => {
    const owner = await makeOwner()
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'P',
      valorEntrada: 2500,
      chavePix: 'pix@t',
    })
    const membership = await prisma.poolMembership.findUniqueOrThrow({
      where: { poolId_userId: { poolId: pool.id, userId: owner.id } },
    })
    expect(membership.paymentStatus).toBe('confirmado')
  })

  it('allows a free pool (valorEntrada 0) with no Pix key', async () => {
    const owner = await makeOwner()
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'Grátis',
      valorEntrada: 0,
      chavePix: null,
    })
    expect(pool.valorEntrada).toBe(0)
    expect(pool.chavePix).toBeNull()
  })

  it('a free pool discards an accidentally-sent Pix key', async () => {
    const owner = await makeOwner()
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'Grátis',
      valorEntrada: 0,
      chavePix: 'pix@t',
    })
    expect(pool.chavePix).toBeNull()
  })

  it('rejects a paid pool without a Pix key', async () => {
    const owner = await makeOwner()
    await expect(
      createPool({ ownerId: owner.id, nome: 'P', valorEntrada: 1000, chavePix: '  ' }),
    ).rejects.toThrow(/chave pix/i)
  })

  it('rejects a negative or non-integer valorEntrada', async () => {
    const owner = await makeOwner()
    await expect(
      createPool({ ownerId: owner.id, nome: 'P', valorEntrada: -1, chavePix: 'pix@t' }),
    ).rejects.toThrow(/inválido/i)
    await expect(
      createPool({ ownerId: owner.id, nome: 'P', valorEntrada: 10.5, chavePix: 'pix@t' }),
    ).rejects.toThrow(/inválido/i)
  })
})

describe('updatePoolPaymentSettings (Block A gate)', () => {
  it('updates fee + Pix key while Block A is open', async () => {
    const owner = await makeOwner()
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'P',
      valorEntrada: 1000,
      chavePix: 'old@pix',
    })
    await seedOpeningMatch(new Date('2026-06-11T19:00:00.000Z'))

    const updated = await updatePoolPaymentSettings({
      poolId: pool.id,
      valorEntrada: 5000,
      chavePix: 'new@pix',
      now: new Date('2026-06-11T17:00:00.000Z'), // 1h+ before Block A close
    })
    expect(updated.valorEntrada).toBe(5000)
    expect(updated.chavePix).toBe('new@pix')
  })

  it('can switch a pool to free (fee 0 clears the Pix key)', async () => {
    const owner = await makeOwner()
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'P',
      valorEntrada: 1000,
      chavePix: 'old@pix',
    })
    const updated = await updatePoolPaymentSettings({
      poolId: pool.id,
      valorEntrada: 0,
      chavePix: null,
      now: new Date('2026-06-01T00:00:00.000Z'),
    })
    expect(updated.valorEntrada).toBe(0)
    expect(updated.chavePix).toBeNull()
  })

  it('rejects edits after the Block A deadline', async () => {
    const owner = await makeOwner()
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'P',
      valorEntrada: 1000,
      chavePix: 'old@pix',
    })
    await seedOpeningMatch(new Date('2026-06-11T19:00:00.000Z'))

    await expect(
      updatePoolPaymentSettings({
        poolId: pool.id,
        valorEntrada: 9999,
        chavePix: 'new@pix',
        now: new Date('2026-06-11T18:00:00.000Z'), // exactly Block A close
      }),
    ).rejects.toBeInstanceOf(BlockAClosedError)

    const reloaded = await prisma.pool.findUniqueOrThrow({ where: { id: pool.id } })
    expect(reloaded.valorEntrada).toBe(1000)
    expect(reloaded.chavePix).toBe('old@pix')
  })
})
