import { Prisma, type Pool, type PoolMembership } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LOCK_LEAD_MS } from '@/domain/deadline'

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

export async function createPool(args: {
  ownerId: string
  nome: string
  valorEntrada: number // BRL cents
  chavePix: string
}): Promise<Pool> {
  const inviteCode = await generateUniqueInviteCode()
  const pool = await prisma.pool.create({
    data: {
      nome: args.nome,
      valorEntrada: args.valorEntrada,
      chavePix: args.chavePix,
      inviteCode,
      owner: { connect: { id: args.ownerId } },
      memberships: { create: { userId: args.ownerId } },
    },
  })
  return pool
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
 * Resolve the viewer's single current pool membership (contract §11.4).
 * v1 assumes a user is effectively in one pool; picks the earliest-joined one.
 */
export async function getCurrentMembership(
  userId: string,
): Promise<PoolMembership | null> {
  return prisma.poolMembership.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
  })
}
