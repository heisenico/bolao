// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CopyLinkButton } from './CopyLinkButton'

describe('CopyLinkButton', () => {
  it('copies the url to the clipboard and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<CopyLinkButton url="https://bolao.app/join/ABC123" />)
    const btn = screen.getByRole('button', { name: /copiar link/i })
    fireEvent.click(btn)

    expect(writeText).toHaveBeenCalledWith('https://bolao.app/join/ABC123')
    await waitFor(() => expect(screen.getByText(/copiado/i)).toBeTruthy())
  })
})
