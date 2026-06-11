import { Prisma, type Pool, type PoolMembership } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LOCK_LEAD_MS, isBlockAOpen } from '@/domain/deadline'
import { getDeadlineContext } from '@/server/deadlines'

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous I/O/0/1
const INVITE_LENGTH = 6

/** Entry closed: now is at/after firstKickoff - 1h (contract §11.5). */
export class EntryClosedError extends Error {
  constructor() {
    super('As inscrições deste bolão já encerraram (1h antes do primeiro jogo).')
    this.name = 'EntryClosedError'
  }
}

function randomInviteCode(): string {
  let code = ''
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]
  }
  return code
}

async function generateUniqueInviteCode(): Promise<string> {
  // Retry on the (rare) collision against the @unique inviteCode column.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInviteCode()
    const existing = await prisma.pool.findUnique({ where: { inviteCode: code } })
    if (!existing) return code
  }
  throw new Error('Could not generate a unique invite code after 10 attempts')
}

/**
 * Validates the entry-fee pair: a paid pool (valorEntrada > 0) requires a Pix
 * key; a free pool (0) carries none — the whole payment flow is hidden for it.
 * Returns the normalized chavePix (trimmed, or null for a free pool).
 */
function normalizePaymentSettings(valorEntrada: number, chavePix: string | null): string | null {
  if (!Number.isInteger(valorEntrada) || valorEntrada < 0) {
    throw new Error('Valor de entrada inválido: use um valor em reais maior ou igual a zero.')
  }
  const trimmed = chavePix?.trim() ?? ''
  if (valorEntrada > 0 && !trimmed) {
    throw new Error('Informe a chave PIX (obrigatória quando há valor de entrada).')
  }
  return valorEntrada > 0 ? trimmed : null
}

export async function createPool(args: {
  ownerId: string
  nome: string
  valorEntrada: number // BRL cents; 0 = free pool
  chavePix: string | null
}): Promise<Pool> {
  const chavePix = normalizePaymentSettings(args.valorEntrada, args.chavePix)
  const inviteCode = await generateUniqueInviteCode()
  const pool = await prisma.pool.create({
    data: {
      nome: args.nome,
      valorEntrada: args.valorEntrada,
      chavePix,
      inviteCode,
      owner: { connect: { id: args.ownerId } },
      // The creator never pays themself: their membership starts confirmed,
      // so their entry counts in the pot without a self Pix transfer.
      memberships: { create: { userId: args.ownerId, paymentStatus: 'confirmado' } },
    },
  })
  return pool
}

/** Thrown when an edit/removal is attempted after the Block A deadline. */
export class BlockAClosedError extends Error {
  constructor(message = 'O prazo do Bloco A já encerrou (1h antes do jogo de abertura).') {
    super(message)
    this.name = 'BlockAClosedError'
  }
}

/**
 * Creator edits the entry fee / Pix key. Allowed only while Block A is open —
 * after entry closes, changing the stakes would distort a locked pool. Members
 * still pendente naturally see the updated values on next load. Ownership is
 * asserted by the caller (adminOps), like the other owner-gated mutations.
 */
export async function updatePoolPaymentSettings(args: {
  poolId: string
  valorEntrada: number // BRL cents
  chavePix: string | null
  now?: Date
}): Promise<Pool> {
  const chavePix = normalizePaymentSettings(args.valorEntrada, args.chavePix)
  const now = args.now ?? new Date()
  const { openingKickoffUtc } = await getDeadlineContext()
  if (!isBlockAOpen(openingKickoffUtc, now)) {
    throw new BlockAClosedError()
  }
  return prisma.pool.update({
    where: { id: args.poolId },
    data: { valorEntrada: args.valorEntrada, chavePix },
  })
}

export async function joinPool(args: {
  inviteCode: string
  userId: string
  now?: Date
}): Promise<PoolMembership> {
  const now = args.now ?? new Date()
  const pool = await prisma.pool.findUnique({ where: { inviteCode: args.inviteCode } })
  if (!pool) {
    throw new Error(`Invite code not found: ${args.inviteCode}`)
  }

  // Existing members short-circuit BEFORE the deadline check: someone already in the
  // pool must keep accessing it after entry closes (idempotent re-visit of /join).
  const existing = await prisma.poolMembership.findUnique({
    where: { poolId_userId: { poolId: pool.id, userId: args.userId } },
  })
  if (existing) return existing

  // Entry deadline (contract §11.5): a NEW member is rejected once now >= firstKickoff - 1h.
  // firstKickoff = min(Match.dataHora). If no matches exist yet, entry is open.
  const firstMatch = await prisma.match.findFirst({ orderBy: { dataHora: 'asc' } })
  if (firstMatch) {
    const entryDeadline = firstMatch.dataHora.getTime() - LOCK_LEAD_MS
    if (now.getTime() >= entryDeadline) {
      throw new EntryClosedError()
    }
  }

  try {
    return await prisma.poolMembership.create({
      data: { poolId: pool.id, userId: args.userId },
    })
  } catch (err) {
    // Concurrent join racing the same unique([poolId, userId]) — return the winner's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const row = await prisma.poolMembership.findUnique({
        where: { poolId_userId: { poolId: pool.id, userId: args.userId } },
      })
      if (row) return row
    }
    throw err
  }
}

export async function getMembership(
  poolId: string,
  userId: string,
): Promise<PoolMembership | null> {
  return prisma.poolMembership.findUnique({
    where: { poolId_userId: { poolId, userId } },
  })
}

/**
 * All bolões the user belongs to, earliest-joined first, each with the pool's
 * id/nome/ownerId (enough for the "Meus bolões" list and an owner check). The
 * schema allows a user in many pools (@@unique([poolId, userId])).
 */
export async function listUserMemberships(userId: string) {
  return prisma.poolMembership.findMany({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    include: { pool: { select: { id: true, nome: true, ownerId: true } } },
  })
}
