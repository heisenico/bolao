'use client'

import { CopyButton } from '@/components/CopyButton'

/**
 * Invite-sharing copy button (CONTRACT §8 admin invite section). Copies the
 * given URL to the clipboard and shows a transient "Copiado!" confirmation.
 */
export function CopyLinkButton({ url }: { url: string }) {
  return <CopyButton text={url} label="Copiar link" />
}
