/** Pure share helpers (no next/prisma). Used by the admin invite section. */

/** Build the absolute join URL for an invite code. */
export function inviteUrl(baseUrl: string, inviteCode: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/join/${encodeURIComponent(inviteCode)}`
}

/** Build a wa.me share URL combining a message and the invite URL. */
export function whatsappShareUrl(message: string, joinUrl: string): string {
  const text = encodeURIComponent(`${message} ${joinUrl}`)
  return `https://wa.me/?text=${text}`
}
