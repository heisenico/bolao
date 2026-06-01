import { describe, it, expect } from 'vitest'
import { inviteUrl, whatsappShareUrl } from './share'

describe('inviteUrl', () => {
  it('builds an absolute join URL from a base and invite code', () => {
    expect(inviteUrl('https://bolao.app', 'ABC123')).toBe('https://bolao.app/join/ABC123')
  })

  it('trims a trailing slash on the base', () => {
    expect(inviteUrl('https://bolao.app/', 'ABC123')).toBe('https://bolao.app/join/ABC123')
  })

  it('url-encodes the invite code', () => {
    expect(inviteUrl('https://bolao.app', 'a b/c')).toBe('https://bolao.app/join/a%20b%2Fc')
  })
})

describe('whatsappShareUrl', () => {
  it('wraps a message + invite url into a wa.me link', () => {
    const url = whatsappShareUrl('Entra no bolão!', 'https://bolao.app/join/ABC123')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(url).toContain(encodeURIComponent('Entra no bolão!'))
    expect(url).toContain(encodeURIComponent('https://bolao.app/join/ABC123'))
  })
})
