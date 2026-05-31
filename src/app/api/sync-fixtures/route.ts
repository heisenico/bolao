import { syncFixtures } from '@/server/results'
import { env } from '@/lib/env'

// External scheduler (cron-job.org) hits this DAILY to refresh teams/fixtures
// (CONTRACT §11.6). Same POLL_SECRET token check as /api/poll-scores.
export const dynamic = 'force-dynamic'

interface SyncDeps {
  pollSecret: string
  sync: () => Promise<{ teams: number; matches: number }>
}

/** Token compare + delegate to syncFixtures. Deps injected for testing. */
export async function handleSync(request: Request, deps: SyncDeps): Promise<Response> {
  if (!deps.pollSecret) {
    return Response.json({ error: 'POLL_SECRET not configured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const provided = request.headers.get('x-poll-secret') ?? url.searchParams.get('secret') ?? ''

  if (provided !== deps.pollSecret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await deps.sync()
  return Response.json(result, { status: 200 })
}

export async function GET(request: Request): Promise<Response> {
  return handleSync(request, {
    pollSecret: env.pollSecret(),
    sync: () => syncFixtures(),
  })
}
