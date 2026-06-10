import { rescoreSettledMatches } from '@/server/results'
import { env } from '@/lib/env'

// Operational safety net (spec Phase 1 backfill): re-runs the CURRENT classifier
// + phase multipliers over every already-settled match. Idempotent — safe to hit
// twice. Use after deploying a scoring change that must rescore history (the
// official rules freeze scoring at the first kickoff, so this should stay a
// no-op for WC2026). Same secret scheme as /api/poll-scores.
export const dynamic = 'force-dynamic'

interface RescoreDeps {
  pollSecret: string
  rescore: () => Promise<{ rescoredMatchIds: string[] }>
}

/** Pure-ish handler: token compare + delegate. Deps injected for testing. */
export async function handleRescore(request: Request, deps: RescoreDeps): Promise<Response> {
  if (!deps.pollSecret) {
    return Response.json({ error: 'POLL_SECRET not configured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const provided = request.headers.get('x-poll-secret') ?? url.searchParams.get('secret') ?? ''

  if (provided !== deps.pollSecret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await deps.rescore()
  return Response.json(result, { status: 200 })
}

export async function GET(request: Request): Promise<Response> {
  return handleRescore(request, {
    pollSecret: env.pollSecret(),
    rescore: () => rescoreSettledMatches(),
  })
}
