'use client'

import { useState } from 'react'

import { Button } from '@/components/Button'

/**
 * One-tap copy with visual feedback ("Copiado!"). Uses the async clipboard API
 * with a hidden-textarea fallback for older mobile browsers (the realistic
 * audience is phones, often inside in-app webviews).
 */
export function CopyButton({
  text,
  label,
  variant = 'secondary',
}: {
  text: string
  label: string
  variant?: 'primary' | 'secondary'
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback: select-and-copy through a transient textarea.
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    } catch (err) {
      console.error(err)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant={variant} type="button" onClick={copy} aria-live="polite">
      {copied ? 'Copiado!' : label}
    </Button>
  )
}
