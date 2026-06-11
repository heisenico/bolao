'use server'

import type { PrizeType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { PRIZE_TYPES } from '@/domain/awards'
import {
  applyPrizeResultAsOwner,
  applyResultAsOwner,
  cancelMatchAsOwner,
  confirmPaymentAsOwner,
  removeMemberAsOwner,
  syncFixturesAsOwner,
} from '@/server/adminOps'

// 'use server' form-action entrypoints ONLY. Every export of this file is a
// POST-reachable server function, so each one resolves the caller from the
// session itself and nothing here accepts a caller id from the request. The
// ownership-gated wrappers live in @/server/adminOps (not a server-action
// module) exactly so they cannot be invoked with a forged callerUserId.

async function currentUserId(): Promise<string> {
  const session = await requireSession()
  return session.user.id
}

export async function applyResultAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const matchId = String(formData.get('matchId'))
  const placarHome = Number(formData.get('placarHome'))
  const placarAway = Number(formData.get('placarAway'))
  await applyResultAsOwner(await currentUserId(), poolId, matchId, placarHome, placarAway)
  revalidatePath(`/admin/${poolId}`)
}

export async function cancelMatchAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const matchId = String(formData.get('matchId'))
  await cancelMatchAsOwner(await currentUserId(), poolId, matchId)
  revalidatePath(`/admin/${poolId}`)
}

export async function confirmPaymentAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const membershipId = String(formData.get('membershipId'))
  await confirmPaymentAsOwner(await currentUserId(), poolId, membershipId)
  revalidatePath(`/admin/${poolId}`)
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const membershipId = String(formData.get('membershipId'))
  await removeMemberAsOwner(await currentUserId(), poolId, membershipId)
  revalidatePath(`/admin/${poolId}`)
}

export async function syncFixturesAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  await syncFixturesAsOwner(await currentUserId(), poolId)
  revalidatePath(`/admin/${poolId}`)
}

export async function applyPrizeResultAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const prizeType = String(formData.get('prizeType'))
  const value = String(formData.get('value') ?? '')
  // Validate the enum value before it reaches Prisma — no silent coercion.
  if (!(PRIZE_TYPES as string[]).includes(prizeType)) {
    throw new Error(`Tipo de prêmio inválido: ${prizeType}`)
  }
  await applyPrizeResultAsOwner(
    await currentUserId(),
    poolId,
    prizeType as PrizeType,
    value,
  )
  revalidatePath(`/admin/${poolId}`)
}
