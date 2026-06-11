# /api/rescore

Token-protected, idempotent rescore of every already-settled match. **Not scheduled —
operator-triggered only.** It exists as the safety net for scoring-rule deploys: it
re-runs the CURRENT classifier + phase multipliers (and creates any missing automatic
0×0 fallback predictions) over all `encerrada` matches with a stored score.

## Auth

Same scheme as `/api/poll-scores` (shared `POLL_SECRET`):
- header: `x-poll-secret: <POLL_SECRET>`, or
- query param: `?secret=<POLL_SECRET>`

Missing/wrong token => `401`. Unconfigured `POLL_SECRET` on the server => `500`.

## When to call it

- **Once, right after deploying the official-rules v2 release.** If the deploy lands
  before the opening match (the plan), no match is settled yet and the call is a no-op —
  hit it anyway to confirm a `200 {"rescoredMatchIds":[]}`.
- After any future change to scoring values/multipliers that must apply to history
  (per the official rules, scoring is immutable after the first kickoff — so ideally
  never again).

## Behavior

Calls `rescoreSettledMatches()`: one transaction per settled match, recomputing
`hitType`, `pontosBase`, and `pontosObtidos` for every prediction from the stored
`placarHome`/`placarAway` and the match's `fase`. Manual results keep their score and
source — only the derived points are recomputed. Running it twice yields identical
results. Cancelled (`cancelada`) and unsettled matches are never touched.
