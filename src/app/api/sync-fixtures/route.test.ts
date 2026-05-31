import { describe, it, expect, vi } from 'vitest'
import { handleSync } from './route'

const SECRET = 'top-secret-token'

function req(opts: { header?: string; query?: string }): Request {
  const url = new URL('http://localhost/api/sync-fixtures')
  if (opts.query !== undefined) url.searchParams.set('secret', opts.query)
  const headers = new Headers()
  if (opts.header !== undefined) headers.set('x-poll-secret', opts.header)
  return new Request(url.toString(), { headers })
}

describe('handleSync', () => {
  it('401 when token is missing', async () => {
    const sync = vi.fn()
    const res = await handleSync(req({}), { pollSecret: SECRET, sync })
    expect(res.status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })

  it('401 when token is wrong', async () => {
    const sync = vi.fn()
    const res = await handleSync(req({ header: 'nope' }), { pollSecret: SECRET, sync })
    expect(res.status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })

  it('200 and calls syncFixtures when token matches via header', async () => {
    const sync = vi.fn(async () => ({ teams: 32, matches: 64 }))
    const res = await handleSync(req({ header: SECRET }), { pollSecret: SECRET, sync })
    expect(res.status).toBe(200)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ teams: 32, matches: 64 })
  })

  it('200 and calls syncFixtures when token matches via query param', async () => {
    const sync = vi.fn(async () => ({ teams: 0, matches: 0 }))
    const res = await handleSync(req({ query: SECRET }), { pollSecret: SECRET, sync })
    expect(res.status).toBe(200)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ teams: 0, matches: 0 })
  })

  it('500 when POLL_SECRET is not configured', async () => {
    const sync = vi.fn()
    const res = await handleSync(req({ header: 'anything' }), { pollSecret: '', sync })
    expect(res.status).toBe(500)
    expect(sync).not.toHaveBeenCalled()
  })
})
