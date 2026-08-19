# 18 — Observability and operations

> **PLACEHOLDER — reserved slot, not yet written.** Nothing below is decided.

Phase: P2 · Milestone: — · Status: **unwritten**

---

## Why this slot is reserved

`12` §4.1–4.2 already specifies `requestId` correlation and structured logging, and `03` §8
specifies CI. What is *not* specified is everything after the code leaves a laptop: where it
runs, how you find out it broke, and how you get the data back.

For a course project this is genuinely low priority. It is reserved rather than written
because writing it now would be speculation about a deployment that does not exist yet.

## What will go here

- Deployment target and process — `OPEN-002` already needs a public URL for the demo QR, and
  that decision is the seed of this document
- Log aggregation and how to trace one `requestId` end to end
- Health checks beyond the `/health` liveness endpoint in `13` §3
- Database backup and restore, and a tested restore
- Migration strategy against a database with real data
- Error alerting, if any
- What "down" means and who finds out

## Deliberately out

- Distributed tracing, APM, SLOs — `12` §9 already rejects these at this size
- Autoscaling, multi-region, blue-green deploys

## Write this when

- [ ] `OPEN-002` is resolved and there is a real deployment target
- [ ] Anyone outside the team is using the system, which is when backups stop being optional
- [ ] After P2 — before then, `db:reset` and a local Postgres are the whole operational story
