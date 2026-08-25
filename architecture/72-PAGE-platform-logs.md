# 72 — Platform logs

Phase: P2 · Milestone: — · Read `19-PLATFORM-OPERATORS.md` first
Related: `18` (what the files are and how they are written), `56` (the *other* log, the
customer's one), `12` §4.1–4.2
Invariants: **INV-011**, INV-006
Status: **`T-077` and `T-078` BUILT 2026-08-25 — routes, path guard, reader, `/ops/logs`,
`<LogViewer>`. `T-090` BUILT 2026-08-26 — the export (`DEC-074`), the viewer's CSS, and the
store location on the page.** The **other** log: `56` is one organisation's audit trail, this is Endur's
log files across the estate. Needs `T-059`

## Purpose

**The rotating log files, on a screen, for the four people who run Endur.**

`18` decided that logs and errors are written to `app-<date>.log` and `error-<date>.log` with
daily and size rotation. `18` §6 then describes the workflow those files exist for — a caller
quotes a `requestId` from an error envelope, and somebody greps for it. This page is that grep
without the ssh session: pick a file, filter, click a `requestId`, read the one request end to
end.

It is a support tool. It is not a dashboard, it is not a metrics surface, and it deliberately
does not aggregate — `71` is where counts live, and counting log lines is the wrong source for
a number the database already knows (`18` §9).

## Route & access

`/ops/logs` — the **platform** route tree (`70` § Route & access), `endur.ops` cookie,
`requirePlatform()`. No `tenantResolver` runs and `req.ctx.orgId` stays `undefined` (`19` §7).

## Capabilities

| Action | Capability | `staff` | `owner` |
|---|---|---|---|
| List files, read a file | `platform.logs.read` | ✔ | ✔ |
| Export a file | `platform.logs.export` | ✔ | ✔ |

Added to `19` §4, in the **platform** catalogue, never `11` §3.

**Both roles, unlike `platform.analytics.read`.** Analytics is the whole estate's commercial
shape and is owner-only because support helps one customer at a time. Diagnostics are the
opposite: the person who needs a stack trace at 2am is support, and an on-call tool the
on-call person cannot open is not a tool.

## INV-011 — why a log viewer is allowed to exist at all

INV-011 says an operator reads **counts, never content**. A log line is neither, so the
question has to be answered rather than assumed.

**It is safe because `18` §3 already made it safe, at the writer.** The log viewer inherits
that property; it does not create it, and it must not be the thing relied upon to enforce it:

| `18` §3 guarantees | Consequence here |
|---|---|
| No request or response bodies are ever logged | There is no feedback text in a file to render |
| `cookie`, `authorization`, `password`, `passwordHash` are **removed**, not masked | There is no credential in a file to render |
| A `respondent` principal logs its `campaignId` and nothing else | There is no respondent identity in a file to render |
| `requestLogger` records method, path, status, duration, `orgId`, `principal`, `requestId` | What is left is routing metadata |

So the honest statement is: **this page is INV-011-compatible because the log files contain no
content, and if that ever stops being true the fix is in `lib/logger.ts`, not here.** A viewer
that filtered sensitive fields out at render time would be a viewer that quietly makes it fine
to write them — which is how a redact list stops being load-bearing.

One line follows and it belongs in `18` as much as here: **anything added to a log line is
added to this screen.** The blast radius of a careless `logger.info({ user })` is now fourteen
days of retained files *and* an internal screen, and the acceptance list below tests for it.

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Files | `GET /api/v1/platform/logs` | → `{ data: LogFileMeta[]; meta: LogStoreMeta }` |
| One file | `GET /api/v1/platform/logs/:file?level&status&path&orgId&requestId&q&cursor` | → paginated `LogLine[]` |
| Export | `GET /api/v1/platform/logs/:file/export?format&<same filters>` | → `text/x-ndjson` \| `text/csv` attachment |

`meta` is where the files are and how long they last, read off the live config — `18` §2 says
they are written and rotated automatically, and an operator should not have to open a config
file to find out where that disk is:

```ts
export type LogStoreMeta = { dir: string; enabled: boolean; retentionDays: number; maxSizeMb: number };
```

```ts
export type LogFileMeta = {
  name: string;        // 'app-2026-08-23.log' | 'error-2026-08-23.log' | 'app-2026-08-23.1.log'
  stream: 'app' | 'error';
  date: string;
  bytes: number;
  lines: number | null;   // null when the file is larger than the count threshold
  modifiedAt: string;
};

export type LogLine = {
  at: string; level: number; msg: string;
  requestId?: string; method?: string; path?: string; status?: number;
  durationMs?: number; orgId?: string; principal?: string;
  err?: { type: string; message: string; stack?: string };
  extra?: Record<string, unknown>;   // anything else on the line, rendered as key/value
};
```

`extra` is not laziness. It is what makes an **unexpected** field visible *as* an unexpected
field, which is the difference between a viewer that would have surfaced the `audit_log.ip`
class of mistake and one that would have rendered it as though it belonged (`56` § Anonymity).

**Where a `LogLine` comes from — two formats, one record.** Since `DEC-075` the files are
written in the bracketed human form described in `18` §2, and `platform/logs/parser.ts` reads
**both** it and the pino JSON that files written before the change still hold. The grammar and
its encoding helpers live in `lib/logFormat.ts` and are imported, never restated: the writer
and the reader of a format have to be the same source or they drift, which is the same argument
as the filename regex below. `extra` carries the `x.<key>=` tail, so an unnamed field is still
unnamed after a round trip; an unparseable line is still rendered raw and flagged, never skipped.

## The file name is the whole attack surface

`:file` is a path segment that becomes a filesystem read. That is the one dangerous thing this
page does, and it is guarded three ways rather than one:

1. **Allowlist by pattern**, not by sanitising: `^(app|error)-\d{4}-\d{2}-\d{2}(\.\d+)?\.log$`.
   Anything else is a `404` before any I/O happens.
2. **Resolve and compare.** `path.resolve(LOG_DIR, name)` must still start with
   `path.resolve(LOG_DIR)`. Rule 1 already makes this unreachable; it is here because rule 1
   is a regex somebody will one day relax.
3. **Never a directory listing from user input.** The file list comes from reading `LOG_DIR`
   and filtering by the same pattern — the client picks from what the server offered.

Same posture as `lib/storage.ts` (`48`), which checks every path component against a character
class rather than stripping `..`, and for the same reason: an allowlist fails closed on the
input nobody thought of.

**Files are read with a bounded window, never slurped.** A 10 MB file is paginated from the
end backwards, because the interesting line is the most recent one and a viewer that has to
load a whole file before showing anything is a viewer nobody opens during an incident.

## State

Local. The selected file and every filter live in the **URL** — an operator pastes a link into
a support thread and the other person sees the same lines.

## Components

`<LogViewer>` (new, `24` §6c, internal-only like `<GrowthChart>`) · `<PageHeader>` ·
`<EmptyState>`.

## Interactions

**Pick a file.** Grouped by stream, newest first, with size and line count. `error-*.log` is
listed first — the reason it exists as a separate file is that finding an error must not mean
grepping megabytes of `200 OK` (`18` §2).

**Filter** by level, status, path prefix, `orgId`, and free text. Every filter is applied
server-side over the parsed line, never by loading everything and filtering in the browser.

**Click a `requestId` and the view collapses to that one request** — every line it produced,
in order, across both files. This is `18` §6's workflow, and it is the reason to build the page
rather than document the grep.

**A `5xx` line expands to its stack trace.** Stacks go to the file and never to a client
(`12` §4.16); an operator is not a client, and this is where they become readable.

**No writes.** No delete, no rotate-now. The page reads — and, since `DEC-074`, copies.

**Export.** The current file with the current filters, as `ndjson` or `csv`, `Content-Disposition:
attachment`. Three things make it a different read from the screen's rather than the same one with
a header bolted on:

- **Chronological, oldest first** — the opposite of the viewer's newest-first page. A file handed
  to somebody else is read top to bottom.
- **Capped**, at `EXPORT_MAX_LINES`. An export that would have been larger ends with a trailing
  `{"truncated":true,...}` line (or a `# truncated` row in `csv`) rather than stopping silently,
  because a diagnostic file that quietly lost its tail is worse than no file.
- **Audited as its own action**, `logs.export`, with the format and every filter — that record is
  the entire reason the original *"no download"* position could be reversed rather than argued
  around (`DEC-074`).

`csv` is a fixed column set — `at, level, msg, requestId, method, path, status, durationMs, orgId,
principal, err.type, err.message`. `extra` is **not** a csv column and that is the one honest
limitation of the format: a spreadsheet cannot carry an open-ended key set, so `ndjson` is the
lossless export and `csv` is the one you can hand to somebody who will open it in Excel.

## States

| State | Behaviour |
|---|---|
| No files | *"Nothing has been written yet"* — real on a fresh checkout before the first request |
| File missing since the list loaded | `404` with *"That file has rotated away"*, not a generic error. It is the expected outcome at midnight and at 10 MB |
| Line unparseable | Rendered raw, flagged, and **not skipped**. A line the parser cannot read is the most interesting line in the file |
| Filter matches nothing | Clear-filters action, distinct from the empty file |
| Not `platform.logs.read` | The nav item is absent; direct navigation is a full-page refusal |
| Org staff reaching `/ops/logs` | `401`, whatever they hold in `grants` (`19` §13) |

## Acceptance

- [x] `/api/v1/platform/logs/:file` accepts only names matching the pattern — asserted with
      `../../etc/passwd`, an absolute path, a URL-encoded traversal and a symlink —
      `platform-logs.test.ts` "the file name is the whole attack surface". The symlink case
      is guarded by an `lstat` check (a name can pass the regex and still be a link) and skips
      itself in the test if the environment cannot create a symlink at all, rather than
      passing for the wrong reason
- [x] An org `user` principal with every capability in `11` §3 gets `401` on both routes —
      `platform-logs.test.ts` "an org user gets 401, whatever they hold in grants"
- [x] **A fixture log file containing a would-be-leaked field renders it under `extra`**, so a
      logging mistake is visible rather than absorbed — asserted against an unexpected
      `userIp` key the parser does not name
- [x] No route on this page can write, delete or rotate a file — only `GET` is mounted;
      asserted with a `POST` to the same path
- [x] A large file renders its most recent page without reading the whole file — the reader
      walks backwards in 64 KB chunks and stops at the page limit (`src/backend/platform/logs/index.ts`'s
      `tailRead`); the test exercises the same algorithm at a size the suite can afford
      (~220 lines) rather than an actual 10 MB fixture, and asserts the two pages are
      contiguous with no gap or repeat
- [x] `requestId` filtering returns every line of one request across both streams — reads
      every rotation of both `app-*`/`error-*` files for that line's date in full rather than
      paginating (documented as a deliberate exception to "never slurped": the files are
      already size-bounded and there are normally only a few per stream per day)
- [x] An unparseable line is shown, not dropped — carried through the existing `extra` field
      as `{ unparsed: true, raw }` rather than a new top-level field, since `LogLine` has no
      such field in its contract and inventing one would diverge from `72` § Data contract
- [x] Reading logs writes a `platform_audit_log` row — **reading is an operator action and is
      audited like one** (`19` §10) — `readOperatorLogFile()` in `service.ts` writes it in its
      own transaction immediately after a successful read
- [x] The page renders correctly when `LOG_TO_FILE=false` and there are no files at all —
      `Logs` (`pages/platform/Logs/index.tsx`) renders `<EmptyState icon="log">` "Nothing
      has been written yet" when `GET /platform/logs` returns `{ data: [] }`, distinct from
      the `forbidden` and `notFound` states

- [x] `GET /platform/logs/:file/export` needs `platform.logs.export` and runs the **same**
      name allowlist as the reader — the traversal, absolute-path and symlink cases are asserted
      against the export route too, not only the read route (`DEC-074`)
- [x] An export writes a `logs.export` `platform_audit_log` row carrying the file, format,
      filters and line count — the record that makes the copy accountable
- [x] A capped export ends with an explicit truncation marker rather than stopping silently

## Out of scope

| Not building | Why |
|---|---|
| Live tail / websocket streaming | Real value, and a second transport with its own auth story. Refresh is enough at this size, and `18` §9 already rejects shipping logs anywhere |
| Log aggregation across processes | One process, one machine (`18` §8). Aggregation is a deployment question and `OPEN-002` seeds it |
| Search across all files at once | The date is in the filename; picking one is the search. A cross-file scan is a full-text index nobody needs yet |
| Charts of log volume | Counting log lines is the wrong source for a number the database knows (`18` §9). `71` owns counts |
| Showing an org administrator their slice of these files | **`56` is their log.** Filtering a shared file by `orgId` and serving it to a customer is one bug away from serving somebody else's, and the two logs have genuinely different subjects — evidence versus diagnostics |
| ~~Download~~ | **Superseded by `DEC-074` on 26 Aug — the owner asked for export directly.** The objection here was never *"diagnostics must not leave"*, it was *"with no audit of where it went"*, and that is answerable: the export writes a `logs.export` row carrying the file, the format, every filter and the line count, so a copy leaving is a recorded operator action exactly like a read (`19` §10) |
