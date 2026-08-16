# 17 — Background jobs and scheduling

> **PLACEHOLDER — reserved slot, not yet written.** Nothing below is decided. It records what
> belongs here and what must be true before it gets written.

Phase: P1 (minimal) → P2 (full) · Milestone: **M0 needs the minimal version** · Status: **unwritten**

---

## This one is a real gap, not just headroom

Several things already specified assume something runs on a timer, and **nothing currently
owns them**:

| Assumed by | What needs to run |
|---|---|
| `10` §4.3, `38` | `campaigns.status` moving `scheduled → open` at `starts_at`, and `open → closed` at `ends_at` |
| `10` §9 | Temporary units and their positions expiring at `ends_at` |
| `11` §4 | Delegations activating and expiring on their validity windows |
| `16` §5 | `subscriptions.seats` recomputation |
| `45` | Webhook retry with backoff over 24 h |
| `15` §2 | Expired refresh-token cleanup |

Right now these are described as happening but have no execution model. **The campaign one is
M0-critical**: a campaign that never opens has no working QR link.

## Minimum viable for M0

Almost certainly: compute status **on read** rather than on a timer.

`campaigns.status` becomes derived from `starts_at` / `ends_at` / an explicit `closed_at`,
so a campaign is "open" because the clock says so, not because a job fired. No scheduler, no
new failure mode on demo day, and it cannot get stuck.

That likely makes `campaign_status` a derived value rather than a stored column — which is a
change to `10` §4.3 and must be recorded as a `DEC-` entry when decided.

## What will go here

- Execution model: in-process interval vs `pg_cron` vs a queue (BullMQ/pg-boss)
- Idempotency and at-least-once semantics for every job
- Failure, retry and alerting policy
- Which work is derived-on-read instead of scheduled, and why
- Tenant fairness — one large org must not starve the others

## Write this when

- [ ] The M0 derived-status approach is confirmed or rejected — **before 22 Aug**
- [ ] Webhooks are being built (`45`, P3), since retry is the first job that genuinely cannot
      be derived on read
- [ ] More than two things need real scheduling; below that, derived-on-read wins

## Open

Tracked as `OPEN-005` in `_MEMORY.md`.
