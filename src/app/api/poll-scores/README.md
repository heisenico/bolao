# /api/poll-scores

Token-protected results poller. **An external scheduler (cron-job.org) must call this
endpoint every ~10-15 min** — Vercel Hobby cron is limited to 1/day (SPEC §13), so it is
not used.

## Auth

Send the `POLL_SECRET` value either as:
- header: `x-poll-secret: <POLL_SECRET>`, or
- query param: `?secret=<POLL_SECRET>`

Missing/wrong token => `401`. Unconfigured `POLL_SECRET` on the server => `500`.

## Behavior

Calls `pollAndSettle()`, which **only acts inside match windows** (an `agendada` match
whose `[dataHora, dataHora + 3h]` window contains `now`). Outside every window it is a
no-op and makes **no API-Football call**, keeping usage under the 100 req/day free budget.

## cron-job.org setup (two jobs — CONTRACT §11.6)

Both routes share the same `POLL_SECRET` token check.

1. **Poll scores (every ~10-15 min):** job pointing at
   `https://<your-app>/api/poll-scores?secret=<POLL_SECRET>` (or set the `x-poll-secret`
   header). Method: `GET`. Settles finished matches inside their windows.
2. **Sync fixtures (daily, once):** job pointing at
   `https://<your-app>/api/sync-fixtures?secret=<POLL_SECRET>`. Method: `GET`. Refreshes
   the teams/fixtures table (new kickoff times, knockout bracket fill-ins). Daily is
   enough — fixtures change rarely and this conserves the 100 req/day budget.
