# 48 — File upload

Phase: P2 · Milestone: — · Related: `12` §4.4, `34` (CSV import), `47` (avatar), `41` (logo)

## Purpose

Two binary uploads: the **organization logo** and a **user avatar**. Small, visible, and
enough to make the org switcher and the people list feel like a real product rather than a
wireframe.

It also covers the React course's "File Upload" checklist item (`54`). Combined with the
existing CSV import (`34`), the project has two genuinely different upload paths — **binary
stored as-is** and **parsed then discarded** — which is a more interesting answer than one.

## Route & access

No page of its own. A component used in two places:

| Where | Route | Doc |
|---|---|---|
| Org logo | `/app/settings#profile` | `41` |
| User avatar | `/app/profile` | `47` |

Serving: `GET /api/v1/files/:id` — no auth for logos and avatars, which are low-sensitivity
and cached hard. Ids are random, not enumerable.

## Capabilities

| Action | Capability | Scope |
|---|---|---|
| Upload org logo | `org.update` | org |
| Upload own avatar | `person.update` | `self` |
| Upload another user's avatar | `person.update` | `subtree` |
| Remove either | same as upload | same |

No new capability strings — uploads are an attribute of the thing they belong to, not a
separate permission (`11` §3).

## Data contract

| Action | Endpoint | Body |
|---|---|---|
| Org logo | `POST /api/v1/org/logo` | `multipart/form-data`, field `file` |
| Own avatar | `POST /api/v1/profile/avatar` | same |
| Other avatar | `POST /api/v1/people/:id/avatar` | same |
| Remove | `DELETE` on the same paths | — |

Response: `{ fileId, url, width, height, bytes }`.

**These routes bypass the JSON body parser** and its 256 kb limit (`12` §4.4), using a
streaming multipart parser with its own cap. That exception is deliberate and is the only one.

## Validation — the part that matters

An upload endpoint is the widest input surface in the application. Every one of these is
required, and the order matters:

| Check | Rule |
|---|---|
| Size | ≤ 2 MB, enforced **during streaming** — reject at the limit, never after buffering |
| Declared type | `image/png`, `image/jpeg`, `image/webp` only |
| **Actual type** | Verified by magic bytes. `Content-Type` is client-supplied and is a claim, not a fact |
| Dimensions | ≤ 4000×4000, checked before any resize, to stop decompression bombs |
| Re-encode | **Always.** Never store the uploaded bytes |
| Filename | Never trusted, never used on disk. Storage name is a generated id |

**Re-encoding is not an optimisation, it is the security control.** Decoding to a bitmap and
re-encoding at a fixed size strips EXIF, embedded payloads and polyglot files in one step, and
it removes any question of whether a stored file could execute.

It also strips **GPS coordinates and device identifiers**, which is why respondent-facing
uploads are out of scope entirely (below).

Rejections return `422` with a message that says which rule failed — *"That file is 4.2 MB;
the limit is 2 MB"*, not *"Invalid file"*.

## Storage

Local disk under `apps/api/storage/<orgId>/<fileId>.webp` for P1–P3, behind a thin interface
so S3 is a swap rather than a rewrite. No object store yet — one more service to run and
explain, for no marks.

Files are tenant-partitioned on disk, which makes an org deletion a directory delete and makes
a cross-tenant path bug visible rather than silent.

Two derivatives per upload, generated on write, never on read: `256px` display and `64px`
thumbnail. On-read resizing is a denial-of-service vector.

## Components

`<FileUpload>` — added to `24-COMPONENT-INVENTORY.md`:

```ts
{ current: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  shape: 'circle' | 'square';       // avatar | logo
  maxBytes?: number;
  disabled?: boolean }
```

Behaviour: click or drop, a client-side preview before the request completes, a progress
indicator for anything over ~200 kb, inline errors (never a toast, `24` §6), and a Remove
action on the current image.

Client-side checks mirror the server's but **never replace them** — same principle as DTO
validation (`14` §7).

Accessible: a real `<input type="file">` underneath, keyboard reachable, with the drop zone as
an enhancement rather than the only path.

## States

| State | Behaviour |
|---|---|
| Empty | Initials placeholder for avatars; a lettermark for logos. Never a broken-image icon |
| Uploading | Preview at reduced opacity + progress; the rest of the form stays usable |
| Error | Inline under the control, naming the specific rule that failed |
| 403 | The control renders read-only — the image shows, the actions do not |
| Removing | Confirm only for the org logo, which is org-wide; an avatar removal is trivially reversible |

## Acceptance

- [ ] A `.exe` renamed `.png` is rejected by magic-byte check, not by extension
- [ ] A 10 MB file is rejected **during** streaming, without being buffered
- [ ] A 20000×20000 PNG is rejected before decode
- [ ] Every stored file is re-encoded; **no uploaded bytes are ever written to disk**
- [ ] EXIF, including GPS, is absent from stored output — verified with a GPS-tagged photo
- [ ] The stored path never contains any part of the client filename
- [ ] A path-traversal filename (`../../etc/passwd`) cannot escape the org directory
- [ ] Uploading another user's avatar without `subtree` scope returns 403
- [ ] The upload route is exempt from the JSON body limit and no other route is
- [ ] Files are tenant-partitioned; deleting an org removes its directory
- [ ] `<FileUpload>` is keyboard operable without drag-and-drop
- [ ] Errors appear inline, never in a toast

## Out of scope

| Not building | Why |
|---|---|
| **Respondent attachments** | Photos would carry EXIF GPS and device ids into an anonymous response. Even stripped server-side, the file arrives before it is stripped, and image content itself can identify a person. Breaches INV-006 — this is a privacy decision, not a scope decision |
| Attachments on feedback answers | Same reason. `AnswerValue` stays six kinds (DEC-010) |
| Document upload (PDF, docx) | No feature needs one. Every added type is added attack surface |
| An object store | Local disk behind an interface until there is a deployment (`18`) |
| Image cropping UI | Server-side centre-crop to a square is enough for an avatar |
| A media library | Two images per org. A library implies management nobody needs |
