# /api/sync-fixtures

Token-protected fixtures sync. **A DAILY external scheduler (cron-job.org) job calls this
endpoint once a day** to refresh the teams/fixtures table (new kickoff times, knockout
bracket fill-ins). Daily cadence keeps usage under the 100 req/day API-Football budget
(CONTRACT §11.6). The frequent (~10-15 min) job hits `/api/poll-scores` instead.

## Auth

Same `POLL_SECRET` token check as `/api/poll-scores`. Send the value either as:
- header: `x-poll-secret: <POLL_SECRET>`, or
- query param: `?secret=<POLL_SECRET>`

Missing/wrong token => `401`. Unconfigured `POLL_SECRET` on the server => `500`.

## Behavior

On a valid token, calls `syncFixtures()` (upserts teams + matches by `apiFootballId`) and
returns `{ teams, matches }` counts.

## cron-job.org setup

Daily `GET` job pointing at `https://<your-app>/api/sync-fixtures?secret=<POLL_SECRET>`.
