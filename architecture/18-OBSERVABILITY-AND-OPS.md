# 18 — Observability and operations

Phase: **P1** · Milestone: — · Owns: `src/backend/lib/logger.ts`, `src/backend/logs/**`
Related: `12` §4.1–4.2 (`requestId`, `requestLogger`), `12` §4.16 (`errorFunnel`), `03` §8 (CI)
Decisions: `_MEMORY.md` DEC-032

> **Was a reserved placeholder until 2026-08-23.** It is written now because the first
> evaluation requires that *"logs and error information should be stored in files at regular
> intervals"*, and nothing in the application writes anything to a file. That criterion is
> what this document answers; the deployment questions the placeholder reserved are still
> deferred and are listed in §8.

---

## 1. What was already true, and what was missing

Two thirds of observability were built in `T-005` and have not changed since.

| Already built | Where |
|---|---|
| A correlation id on every request, echoed in the response and the error envelope | `12` §4.1 |
| Structured JSON logs — method, path, status, duration, `orgId`, `principal`, `requestId` | `12` §4.2 |
| A single error exit that logs every error once, at `error` for 5xx and `warn` for 4xx | `12` §4.16 |
| A redact list, so a cookie, an `Authorization` header or a password cannot reach a log | `lib/logger.ts` |

**What was missing is the destination.** `pino` was constructed with a level and a redact
list and no transport, which means every line went to stdout and was gone the moment the
process exited. A log you cannot read tomorrow is not a log; it is a `console.log` with better
formatting.

## 2. The decision

**Write to files on disk, with rotation, in addition to stdout — never instead of it.**

```
src/backend/logs/
  app-2026-08-23.log        every request + every application event
  error-2026-08-23.log      WARN and above only
```

Both streams, always. stdout is what a container platform and `npm run dev` read; the files
are what survives a restart and what an evaluator can open. `pino.multistream` gives both from
one logger, so there is still exactly one logger and one format — the property `lib/logger.ts`
was already protecting.

**A separate error file is not duplication, it is the point.** *"Error information should be
stored"* is a distinct requirement from *"logs should be stored"*, and the two have different
readers: `app-*.log` answers *what was the system doing*, `error-*.log` answers *what went
wrong*, and the second must not require grepping a hundred megabytes of `200 OK` to find. Every
error line appears in both files; `error-*.log` is a filtered view, not a move.

### Rotation and retention

| Rule | Value | Why |
|---|---|---|
| Rotate | Daily, plus at 10 MB | A date in the filename is what makes *"at regular intervals"* legible at a glance |
| Retain | 14 days | Long enough to investigate; short enough that a laptop checkout never grows unbounded |
| Compress | No | One more thing to explain and undo before reading. At this size it buys nothing |
| Directory | `src/backend/logs/`, gitignored | Logs are runtime state. A committed log is a leaked log |

The directory is created at boot if absent. **A logging failure must never take down the
application** — if the file stream cannot be opened, the process logs that fact to stdout and
continues. Availability lost to an observability feature is the worst possible trade.

## 3. What is never written

Inherited from `12` §4.2 and now more important, because disk is permanent and stdout is not.

- **No request or response bodies.** Bodies carry feedback text and credentials, and the
  reason `requestLogger` is hand-rolled rather than `pino-http` is precisely that its default
  serialiser logs more than we want.
- **No `cookie`, `authorization`, `password` or `passwordHash`** — the `redact` list, which
  is `remove: true` rather than a mask, so the key is absent rather than present-and-starred.
- **No respondent identity, ever.** A `respondent` principal logs its `campaignId`, never
  anything that could bridge back to a person. Writing that to a file that survives the
  request would be INV-006 defeated by a log line.
- **No stack traces to the client.** They go to the file. That distinction is `errorFunnel`'s
  and it is unchanged.

> **Writing logs to disk widens the blast radius of a logging mistake from one terminal
> session to fourteen days of retained files.** The redact list is not belt-and-braces any
> more; it is load-bearing.

## 4. Levels, and what earns each one

| Level | Used for |
|---|---|
| `error` | 5xx. Something is broken and a human should look |
| `warn` | 4xx that indicate misuse rather than a typo — `CSRF_FAILED`, `RATE_LIMITED`, `FORBIDDEN` |
| `info` | One line per completed request. The default |
| `debug` | Resolver decision traces, off in production |

`LOG_LEVEL` already exists in config and gates all four. A 403 is a `warn` and not an `error`
on purpose: a permission system that works produces 403s, and an error log full of correct
denials is an error log nobody reads.

## 5. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `LOG_LEVEL` | `info` | Existing. Unchanged |
| `LOG_DIR` | `src/backend/logs` | Where the files go |
| `LOG_TO_FILE` | `true` | `false` in tests, so a suite run does not produce 14 days of noise |
| `LOG_RETENTION_DAYS` | `14` | |
| `LOG_MAX_SIZE_MB` | `10` | Size-based rotation, alongside daily |

All five go in `.env.example` (`03` §6) and through the same Zod config schema as everything
else — an unparseable log setting should fail at boot, not at the first error.

## 6. Reading one request end to end

The workflow this exists to support, and the one to demonstrate:

```bash
# a caller reports a failure and quotes the request id from the error envelope
grep '"requestId":"01J8..."' src/backend/logs/*.log
```

`requestId` is generated by `12` §4.1, returned in `X-Request-Id`, echoed in every error
envelope, and present on every log line the request produced. One id ties the client's error
message to the server's stack trace, which is the entire argument for `12` §9 rejecting
distributed tracing at this size.

## 7. Acceptance

**Built 2026-08-23 (`T-063`).** `lib/logFile.ts` is the rotating stream, `lib/logger.ts`
composes it with stdout through `pino.multistream`. Ticked boxes are asserted in
`src/backend/test/logging.test.ts`.

- [x] A 500 writes to **both** `app-*.log` and `error-*.log`; a 200 writes only to `app-*.log`
- [x] A log line carrying `password` or `passwordHash` reaches disk with the **key absent**,
      asserted against the real `loggerOptions` rather than a lookalike
- [x] A file older than `LOG_RETENTION_DAYS` is removed, and one that is not is kept
- [x] Retention is decided by the **date in the filename**, not by mtime — a file touched by a
      backup tool is still last Tuesday's log
- [x] A file that is not ours is never deleted from the log directory
- [x] Rotation produces a new file at `LOG_MAX_SIZE_MB` (`app-<date>.1.log`) and at the day
      boundary
- [x] A restart mid-day appends to the day's file rather than truncating it
- [x] With `LOG_DIR` pointed at an unusable path, the process does not throw, keeps serving,
      and says once on stdout that file logging is off
- [x] With `LOG_TO_FILE=false` — the default under `NODE_ENV=test` — no file is created at all
- [x] `logs/` is gitignored, and `git status` is clean after a full test run
- [ ] After one request, `logs/app-<today>.log` contains exactly one `request` line — verified
      by hand against a running server, not by a test: file logging is off in the suite, and
      turning it on for one test would mean re-importing a module that reads config at load
- [ ] A respondent submit logs `campaignId` and no respondent-identifying field — the code
      does this (`requestLogger` logs `principal` as `kind:campaignId`), but no test asserts it
- [x] Stack traces appear in `error-*.log` and in no HTTP response

### A note on synchronous writes

`logFile.ts` writes with `fs.writeSync` rather than through a `WriteStream`. A stream buffers,
and the lines you most want on disk are the ones written immediately before the process died —
exactly the ones a buffer loses. At this volume the blocking cost is microseconds per line.
If throughput ever matters more than the last error before a crash, that is the line to change,
and it should be changed deliberately.

## 8. Still deferred — the placeholder's original questions

These were reserved before this document existed and remain unanswered. None blocks the
evaluation; all become real the moment the system runs anywhere but a laptop.

- Deployment target and process — still seeded by `OPEN-002`
- Log **aggregation** (as opposed to log persistence, which is §2). Not needed for one process
- Health checks beyond `/healthz` liveness
- Database backup, restore, and a *tested* restore
- Migration strategy against a database holding real data
- Error alerting, and who finds out

## 9. Who reads these files, and who reads the other log

Two logs exist, they have different subjects, and the 2026-08-23 request for *"admins of Endur
and of an organisation must be able to see logs"* is answered by **both** — differently.

| | `app-*.log` / `error-*.log` (this document) | `audit_log` (`10` §5) |
|---|---|---|
| Subject | What the **system** did — requests, statuses, durations, stack traces | What **people** did, and which grant allowed it |
| Scope | Every tenant, one file | One organisation, per row |
| Lifetime | 14 days, then deleted | Forever. It is evidence |
| Read at | `/ops/logs` (`72`) | `/app/logs` (`56`) |
| Read by | A platform operator, `platform.logs.read` | An org administrator, `audit.read` |

**An organisation administrator does not read these files, and that is a decision rather than
an omission.** They are one file per day across every tenant; serving a customer a filtered
slice means one filter bug away from serving somebody else's traffic, and the interesting
content for a customer — who changed what, and how were they allowed to — is not in here at
all. It is in `audit_log`, which is per-row tenant-scoped by construction (INV-010) and which
`56` renders.

Stated the other way round: the customer's question is *"who did this?"* and the operator's is
*"what broke?"*. Two questions, two tables, two screens, two capabilities.

### One consequence for anything added to a log line

`72` puts these files on a screen. Combined with §2's fourteen-day retention, the blast radius
of a careless `logger.info({ user })` is now retained files **and** an internal viewer. §3 was
already load-bearing; it is now the only thing standing between a stray field and both.
`72` § Acceptance tests for exactly that, with a fixture line carrying an unexpected key.

## 10. Out of scope

| Not building | Why |
|---|---|
| Distributed tracing, APM, SLOs | `12` §9 rejects these at this size and that still holds |
| A log shipper (Loki, ELK, CloudWatch) | One process, one machine. `grep` is the correct tool here and saying so is more honest than adding a service to look serious |
| Log-based metrics or dashboards | Counting log lines is the wrong source for a number the database already knows |
| Audit logging | **Different thing entirely, and already built.** `audit_log` is a durable business record written inside the handler's transaction (INV-007, `12` §4.14). These files are operational and disposable. Never conflate them: one is evidence, the other is diagnostics |
| A viewer for these files | Built, but it is `72-PAGE-platform-logs.md`'s and not this document's. This one decides what is written; that one decides who may read it — and the answer is **a platform operator, never a customer**. See §10 |
