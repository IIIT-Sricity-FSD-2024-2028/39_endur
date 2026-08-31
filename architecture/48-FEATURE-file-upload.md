# 48 — File upload

Phase: **P1** (re-tagged 2026-08-23, CONF-018 — the first evaluation makes file upload mandatory)
Milestone: — · Related: `12` §4.4, `34` (CSV import), `47` (avatar), `41` (logo)
Status: **BUILT 2026-08-23 (`T-061`, `T-062`)** — with one deliberate deviation, § Re-encode
Owns: `src/backend/middleware/upload.ts`, `src/backend/lib/imageBytes.ts`,
`src/backend/lib/storage.ts`, `src/backend/features/files/**`,
`src/frontend/components/form/FileUpload.tsx`

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
| Org logo | `/app/settings`, in the Organization card | `41` |
| User avatar | `/app/profile` | `47` — that page is **partial**: the avatar is real, the rest is `T-051` |

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

| Check | Rule | Built |
|---|---|---|
| Size | ≤ `UPLOAD_MAX_MB` (2 MB), counted **as the bytes arrive** — refused at the limit, never after buffering | ✔ |
| Declared type | `image/png`, `image/jpeg`, `image/webp` only | ✔ |
| **Actual type** | Verified by magic bytes. `Content-Type` is client-supplied and is a claim, not a fact | ✔ |
| Dimensions | ≤ 4000×4000, read from the header before anything decodes it, to stop decompression bombs | ✔ |
| Re-encode | **Superseded — see below** | ✖ |
| **Metadata strip** | EXIF, XMP, IPTC and PNG text chunks removed from the stored bytes | ✔ |
| Filename | Never trusted, never used on disk. Storage name is a generated id | ✔ |

### Re-encode → strip: what changed, and what it costs

This section originally said *"Re-encode: **Always.** Never store the uploaded bytes"*, on the
argument that decoding to a bitmap and writing a new file strips EXIF, embedded payloads and
polyglot files in one step.

**It was not built that way, and the reason is `OPEN-008`.** Re-encoding needs an image
library — `sharp` or equivalent — which is a dependency nobody has approved, and installing
one unasked is not this document's call to make. What is built instead is
`lib/imageBytes.ts`, which **removes the metadata segments without decoding**:

| Format | Removed | Kept, and why |
|---|---|---|
| JPEG | APP1 (EXIF **and its GPS block**, XMP), APP13 (IPTC/Photoshop), COM | APP0 (JFIF density), APP2 (ICC), APP14 (Adobe) — none identifies a person or a place, and dropping ICC or Adobe silently shifts the colours of the image we were asked to store |
| PNG | `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME` | Everything a decoder needs |
| WebP | `EXIF` and `XMP ` chunks, and the VP8X flag bits that advertise them | The image chunks |

**What that gets us:** GPS coordinates, device identifiers, author names and embedded
thumbnails do not reach disk. That is the privacy property this section was written for, and
it is verified by a test that uploads a JPEG carrying a GPS string and greps the stored bytes.

**What it does not get us, stated plainly rather than left implicit:** stripping does not
neutralise a polyglot file whose payload hides inside the image data itself, and it does not
normalise a malformed image. What makes that survivable is the rest of the design rather than
this step — stored files are only ever **served as bytes** with a sniffed `Content-Type`,
`X-Content-Type-Options: nosniff` and `Content-Disposition: inline`, never executed, never
parsed as anything else, never handed to a shell; and **respondent uploads are out of scope
entirely** (below), which is where a hostile file would actually come from.

If an image library is ever approved, `stripMetadata()` is the one function to replace and
the acceptance list below is the checklist it has to keep passing.

Rejections return `422` with a message that says which rule failed — *"That file is 4.2 MB;
the limit is 2 MB"*, not *"Invalid file"*.

## Storage

Local disk under `src/backend/storage/<orgId>/<fileId>.<ext>` for P1–P3, behind `lib/storage.ts`
so S3 is a swap rather than a rewrite. No object store yet — one more service to run and
explain, for no marks. `STORAGE_DIR` overrides the root; the test suite points it at a temp
directory so a run leaves nothing behind.

The extension is the **sniffed** one, not the uploaded one — a file that arrived as
`logo.png` and is really a JPEG is stored as `.jpg`, because the extension is derived from the
bytes in the same step that decided whether to accept them at all.

Files are tenant-partitioned on disk, which makes an org deletion a directory delete and makes
a cross-tenant path bug visible rather than silent.

**Derivatives are not built** (`256px` display, `64px` thumbnail). They need the same image
library `OPEN-008` is waiting on. `<FileUpload>` renders at a fixed CSS size, so the visible
result is correct and the cost is bandwidth rather than layout. On-**read** resizing stays
ruled out whenever they are built: it is a denial-of-service vector.

## Components

`<FileUpload>` — added to `24-COMPONENT-INVENTORY.md`:

```ts
{ current: string | null;          // the stored image, as a url
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  shape: 'circle' | 'square';      // avatar | logo
  label: string;                   // required — an unlabelled file input is inaccessible
  hint?: string;
  maxBytes?: number;
  disabled?: boolean }
```

Behaviour: click or drop, a client-side preview before the request completes, inline errors
(never a toast, `24` §6), and a Remove action on the current image.

**No progress bar.** `fetch` gives no upload progress without moving to `XMLHttpRequest`, and
at a 2 MB cap the honest indicator is a busy state that says *Uploading…* rather than a bar
that would have to be faked. If the cap ever rises, this is the line to revisit.

Client-side checks mirror the server's but **never replace them** — same principle as DTO
validation (`14` §7).

Accessible: a real `<input type="file">` underneath, keyboard reachable, with the drop zone as
an enhancement rather than the only path.

## States

| State | Behaviour |
|---|---|
| Empty | Initials placeholder for avatars; a lettermark for logos. Never a broken-image icon |
| Uploading | Local preview at reduced opacity, *Uploading…* under the control; the rest of the form stays usable |
| Error | Inline under the control, naming the specific rule that failed — the server's message, not a generic one |
| 403 | The control renders read-only — the image shows, the actions do not. Driven by `can('org.update')` in `41`, not by catching a 403 |
| Removing | **Not confirmed yet.** The intent was a `<ConfirmDialog>` on the logo, which is org-wide, and none on an avatar. Not built: `T-058` brings `<ConfirmDialog>` onto this screen anyway and doing it twice is worse than doing it once |

## Acceptance

Ticked boxes are asserted in `src/backend/test/upload.test.ts` and
`src/frontend/components/form/FileUpload.test.tsx`.

- [x] A `.exe` renamed `.png` is rejected by magic-byte check, not by extension
- [x] An oversized file is rejected **as it arrives**, and still gets a 413 rather than a
      dropped connection — the request is unpiped and drained, not destroyed
- [x] A 20000×20000 PNG is rejected before anything decodes it
- [ ] ~~Every stored file is re-encoded~~ — **superseded**, see § Re-encode → strip
- [x] EXIF, including GPS, is absent from stored output — verified with a tagged JPEG
- [x] PNG text chunks are absent from stored output, and `IHDR`/`IDAT`/`IEND` survive
- [x] The stored path never contains any part of the client filename
- [x] A path-traversal filename (`../../etc/passwd`) cannot escape the org directory
- [x] An upload without the capability returns 403, decided in middleware
- [x] An upload with no session returns 401
- [x] The upload route is exempt from the JSON body limit and no other route is
- [x] Files are tenant-partitioned, and replacing an image deletes the one it replaced
- [x] Serving needs no session, no tenant and no CSRF, and 404s an unknown id
- [x] `<FileUpload>` is keyboard operable without drag-and-drop — a real `<input type=file>`
- [x] Errors appear inline, never in a toast, and name the rule that failed
- [ ] Uploading another user's avatar without `subtree` scope returns 403 — the route exists
      and is guarded with `target: 'person'`; the scope case is not yet asserted by a test

## Out of scope

| Not building | Why |
|---|---|
| **Respondent attachments** | Photos would carry EXIF GPS and device ids into an anonymous response. Even stripped server-side, the file arrives before it is stripped, and image content itself can identify a person. Breaches INV-006 — this is a privacy decision, not a scope decision |
| Attachments on feedback answers | Same reason. `AnswerValue` stays six kinds (DEC-010) |
| Document upload (PDF, docx) | No feature needs one. Every added type is added attack surface |
| An object store | Local disk behind an interface until there is a deployment (`18`) |
| Image cropping UI | Server-side centre-crop to a square is enough for an avatar |
| A media library | Two images per org. A library implies management nobody needs |
