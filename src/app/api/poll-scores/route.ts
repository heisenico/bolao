import { pollAndSettle } from '@/server/results'
import { env } from '@/lib/env'

// External scheduler (cron-job.org) hits this every ~10-15 min. It only does real
// work inside match windows (pollAndSettle no-ops otherwise), preserving API quota.
export const dynamic = 'force-dynamic'

interface PollDeps {
  pollSecret: string
  settle: () => Promise<{ settledMatchIds: string[] }>
}

/** Pure-ish handler: token compare + delegate. Deps injected for testing. */
export async function handlePoll(request: Request, deps: PollDeps): Promise<Response> {
  if (!deps.pollSecret) {
    return Response.json({ error: 'POLL_SECRET not configured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const provided = request.headers.get('x-poll-secret') ?? url.searchParams.get('secret') ?? ''

  if (provided !== deps.pollSecret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await deps.settle()
  return Response.json(result, { status: 200 })
}

export async function GET(request: Request): Promise<Response> {
  return handlePoll(request, {
    pollSecret: env.pollSecret(),
    settle: () => pollAndSettle(),
  })
}
