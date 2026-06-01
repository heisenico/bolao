'use client'

import { useState } from 'react'

/**
 * Invite-sharing copy button (CONTRACT §8 admin invite section). Copies the
 * given URL to the clipboard and shows a transient "Copiado!" confirmation.
 */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-[#CCCCCC] bg-white px-3 py-2 text-sm font-semibold text-[#333333]"
    >
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}
