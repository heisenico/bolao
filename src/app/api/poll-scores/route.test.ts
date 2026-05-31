import { describe, it, expect, vi } from 'vitest'
import { handlePoll } from './route'

const SECRET = 'top-secret-token'

function req(opts: { header?: string; query?: string }): Request {
  const url = new URL('http://localhost/api/poll-scores')
  if (opts.query !== undefined) url.searchParams.set('secret', opts.query)
  const headers = new Headers()
  if (opts.header !== undefined) headers.set('x-poll-secret', opts.header)
  return new Request(url.toString(), { headers })
}

describe('handlePoll', () => {
  it('401 when token is missing', async () => {
    const settle = vi.fn()
    const res = await handlePoll(req({}), { pollSecret: SECRET, settle })
    expect(res.status).toBe(401)
    expect(settle).not.toHaveBeenCalled()
  })

  it('401 when token is wrong', async () => {
    const settle = vi.fn()
    const res = await handlePoll(req({ header: 'nope' }), { pollSecret: SECRET, settle })
    expect(res.status).toBe(401)
    expect(settle).not.toHaveBeenCalled()
  })

  it('200 and calls settle when token matches via header', async () => {
    const settle = vi.fn(async () => ({ settledMatchIds: ['m1', 'm2'] }))
    const res = await handlePoll(req({ header: SECRET }), { pollSecret: SECRET, settle })
    expect(res.status).toBe(200)
    expect(settle).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ settledMatchIds: ['m1', 'm2'] })
  })

  it('200 and calls settle when token matches via query param', async () => {
    const settle = vi.fn(async () => ({ settledMatchIds: [] }))
    const res = await handlePoll(req({ query: SECRET }), { pollSecret: SECRET, settle })
    expect(res.status).toBe(200)
    expect(settle).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ settledMatchIds: [] })
  })

  it('500 when POLL_SECRET is not configured', async () => {
    const settle = vi.fn()
    const res = await handlePoll(req({ header: 'anything' }), { pollSecret: '', settle })
    expect(res.status).toBe(500)
    expect(settle).not.toHaveBeenCalled()
  })
})
