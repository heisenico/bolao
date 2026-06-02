'use client'

import { useState } from 'react'

import { Button } from '@/components/Button'

/**
 * Invite-sharing copy button (CONTRACT §8 admin invite section). Copies the
 * given URL to the clipboard and shows a transient "Copiado!" confirmation.
 */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch (err) {
      console.error(err)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="secondary" type="button" onClick={copy} aria-live="polite">
      {copied ? 'Copiado!' : 'Copiar link'}
    </Button>
  )
}
