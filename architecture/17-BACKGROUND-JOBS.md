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
<<<<<<< HEAD
| `10` §4.3, `38` | `campaigns.status` moving `scheduled → open` at `starts_at`, and `open → closed` at `ends_at` |
=======
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
| `10` §9 | Temporary units and their positions expiring at `ends_at` |
| `11` §4 | Delegations activating and expiring on their validity windows |
| `16` §5 | `subscriptions.seats` recomputation |
| `45` | Webhook retry with backoff over 24 h |
| `15` §2 | Expired refresh-token cleanup |

<<<<<<< HEAD
Right now these are described as happening but have no execution model. **The campaign one is
M0-critical**: a campaign that never opens has no working QR link.

## Minimum viable for M0

Almost certainly: compute status **on read** rather than on a timer.

`campaigns.status` becomes derived from `starts_at` / `ends_at` / an explicit `closed_at`,
so a campaign is "open" because the clock says so, not because a job fired. No scheduler, no
new failure mode on demo day, and it cannot get stuck.

That likely makes `campaign_status` a derived value rather than a stored column — which is a
change to `10` §4.3 and must be recorded as a `DEC-` entry when decided.
=======
Right now these are described as happening but have no execution model. None of the four
remaining rows is M0-critical: each degrades to a stale row rather than a broken demo.

## Resolved: the campaign row, which was the M0-critical one

**`DEC-016`, 2026-08-19 — campaign status is derived on read.** It is computed from
`closed_at` / `public_token` / `starts_at` / `ends_at` every time a campaign is read, so a
campaign is open because the clock says so, not because a job fired. The stored column and
the `campaign_status` enum are gone (`10` §4.3), and `17` no longer owes anything to `38`.

The general lesson this doc should keep: **derived-on-read is the default, and a scheduler
has to earn its place.** Three of the four rows above are the same shape — a validity window
whose expiry can simply be part of the query — and only webhook retry genuinely cannot be.
>>>>>>> 95a69183487c1f29e2422c760433704d08948484

## What will go here

- Execution model: in-process interval vs `pg_cron` vs a queue (BullMQ/pg-boss)
- Idempotency and at-least-once semantics for every job
- Failure, retry and alerting policy
- Which work is derived-on-read instead of scheduled, and why
- Tenant fairness — one large org must not starve the others

## Write this when

<<<<<<< HEAD
- [ ] The M0 derived-status approach is confirmed or rejected — **before 22 Aug**
=======
- [x] The M0 derived-status approach is confirmed — `DEC-016`, 2026-08-19
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
- [ ] Webhooks are being built (`45`, P3), since retry is the first job that genuinely cannot
      be derived on read
- [ ] More than two things need real scheduling; below that, derived-on-read wins

## Open

<<<<<<< HEAD
Tracked as `OPEN-005` in `_MEMORY.md`.
=======
`OPEN-005` is **resolved** by `DEC-016` for campaigns. It remains open in `_MEMORY.md` only
as the record of what is still unowned: temporary unit and position expiry, delegation
windows, seat recompute, and webhook retry.
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
