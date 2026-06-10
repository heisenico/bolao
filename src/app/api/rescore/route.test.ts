import { describe, it, expect, vi } from 'vitest'
import { handleRescore } from './route'

const SECRET = 'top-secret-token'

function req(opts: { header?: string; query?: string }): Request {
  const url = new URL('http://localhost/api/rescore')
  if (opts.query !== undefined) url.searchParams.set('secret', opts.query)
  const headers = new Headers()
  if (opts.header !== undefined) headers.set('x-poll-secret', opts.header)
  return new Request(url.toString(), { headers })
}

describe('handleRescore', () => {
  it('401 when token is missing', async () => {
    const rescore = vi.fn()
    const res = await handleRescore(req({}), { pollSecret: SECRET, rescore })
    expect(res.status).toBe(401)
    expect(rescore).not.toHaveBeenCalled()
  })

  it('401 when token is wrong', async () => {
    const rescore = vi.fn()
    const res = await handleRescore(req({ header: 'nope' }), { pollSecret: SECRET, rescore })
    expect(res.status).toBe(401)
    expect(rescore).not.toHaveBeenCalled()
  })

  it('200 and calls rescore when token matches via header', async () => {
    const rescore = vi.fn(async () => ({ rescoredMatchIds: ['m1'] }))
    const res = await handleRescore(req({ header: SECRET }), { pollSecret: SECRET, rescore })
    expect(res.status).toBe(200)
    expect(rescore).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ rescoredMatchIds: ['m1'] })
  })

  it('200 and calls rescore when token matches via query param', async () => {
    const rescore = vi.fn(async () => ({ rescoredMatchIds: [] }))
    const res = await handleRescore(req({ query: SECRET }), { pollSecret: SECRET, rescore })
    expect(res.status).toBe(200)
    expect(rescore).toHaveBeenCalledTimes(1)
  })

  it('500 when POLL_SECRET is not configured', async () => {
    const rescore = vi.fn()
    const res = await handleRescore(req({ header: 'anything' }), { pollSecret: '', rescore })
    expect(res.status).toBe(500)
    expect(rescore).not.toHaveBeenCalled()
  })
})
