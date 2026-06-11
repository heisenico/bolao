'use client'

import { useState } from 'react'

import { Button } from '@/components/Button'

/**
 * Native share-sheet button (navigator.share) — the realistic path to WhatsApp
 * on Brazilian phones. Where the API is unavailable (desktop, some webviews)
 * it falls back to copying the full message and confirms with "Copiado!".
 * A user dismissing the sheet (AbortError) is not an error.
 */
export function ShareInviteButton({
  text,
  url,
}: {
  /** Prefilled message (the share sheet appends/merges the url). */
  text: string
  url: string
}) {
  const [copied, setCopied] = useState(false)

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, url })
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') console.error(err)
      }
      return
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
    } catch (err) {
      console.error(err)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button type="button" onClick={share} aria-live="polite">
      {copied ? 'Copiado!' : 'Compartilhar'}
    </Button>
  )
}
