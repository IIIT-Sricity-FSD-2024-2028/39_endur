# 47 — My profile

Phase: P2 · Milestone: — · Design ref: `design_specs/design/04-PAGE-ADMIN-CONSOLE.md` §4.4 (reuses the person-detail anatomy)

## Purpose

The signed-in user's own account: who they are, how to change their password, and — the part
that earns the page — **what they can actually do, and where**.

Distinct from `/app/people/:id`, which is an administrator looking at somebody else. Same
underlying data, different capability path: this one resolves under `self` scope, so a person
with no administrative permission at all can still open it. That makes it the cleanest
demonstration in the product of the `self` scope in `11` §4.

Also the teacher's "Profile" checklist item (`54`).

## Route & access

`/app/profile` — console world, session required. Reachable from the user chip menu in the top
bar (`24` §2).

## Capabilities

| Action | Capability | Scope |
|---|---|---|
| View own profile | `person.read` | `self` |
| Edit own name | `person.update` | `self` |
| Change own password | — (session identity is the authorisation) | — |
| Upload own avatar | `person.update` | `self` |
| View own effective powers | `person.read` | `self` |

**Every role gets these `self` grants by default** (`11` §8). A profile page nobody can open
is a bug, and it is the kind of bug a default-deny model produces if `self` is forgotten.

Password change is deliberately **not** capability-gated: proving you are the session holder
*is* the authorisation, and it additionally requires the current password (§Interactions).

## Data contract

| Action | Endpoint | DTO |
|---|---|---|
| Load | `GET /api/v1/profile` | → `ProfileView` |
| Update | `PATCH /api/v1/profile` | `UpdateProfileBody { name? }` |
| Change password | `POST /api/v1/profile/password` | `ChangePasswordBody { currentPassword, newPassword }` |
| Avatar | `POST /api/v1/profile/avatar` | multipart (`48`) |

```ts
export type ProfileView = {
  user: { id: string; name: string; email: string; avatarUrl: string | null;
          lastLoginAt: string | null };
  positions: { roleName: string; roleLevel: number; unitName: string;
               isPrimary: boolean; validTo: string | null }[];
  powersByPlace: { unitId: string | null; unitName: string;
                   capabilities: string[] }[];
};
```

`powersByPlace` comes from the **same resolver the middleware uses** (`11` §6), never a
second implementation — the same rule that governs the simulator (`_MEMORY.md` N-005).

Email is **read-only here.** Changing it is an identity change and belongs to an administrator
on `34`, with an audit trail. A self-service email change is an account-takeover path.

## State

Local. On a successful name or avatar change, update `authSlice` so the top-bar user chip
reflects it immediately without a reload.

## Components

`<PageHeader>` · `<PersonChip>` · `<ConfirmDialog>` · `<Toast>` · `<FileUpload>` (`48`) ·
`<EmptyState>`. No new components.

## Interactions

**Identity.** Name (inline editable, `24` §7), email (read-only with a one-line explanation of
why), avatar upload, last sign-in.

**Password change.** Requires the current password. Three reasons, and the first is the one
that matters: an unattended logged-in session must not be enough to lock the real owner out.
On success, **regenerate the session** (`15` § Session hygiene) and show a confirmation.

**Positions.** Each rendered `Role — Unit`, with the level and any expiry date. Read-only —
you cannot grant yourself a position, which is the self-approval loop `33` warns about, closed
structurally here rather than detected later.

**Effective powers by place** — the reason the page exists:

```
On Computer Science    campaign.launch · results.read · person.read
On School of Eng.      results.read
Anywhere else          nothing
```

This is INV-005 made personal. "Why can't I see the Mechanical department's results?" is
answered by the user themselves, without opening a ticket — and the `Why?` link on any row
opens the simulator (`42`) pre-filled with that capability.

## States

| State | Behaviour |
|---|---|
| Empty (no positions) | *"You don't hold any positions yet."* + who to ask. A real state for a newly invited user, and it must not read as an error |
| Loading | Skeleton |
| Error | Inline per card; other cards stay usable |
| 403 | Not reachable — `self` grants are seeded to every role. If it ever 403s, the seed is broken |
| Password mismatch | Inline on the current-password field, not a toast |

## Acceptance

- [ ] Openable by a user with **no** administrative capability whatsoever
- [ ] `powersByPlace` is produced by the shared resolver, not a reimplementation
- [ ] Powers on unit A do not appear under unit B (INV-005)
- [ ] Email cannot be changed here
- [ ] Password change requires the current password and regenerates the session
- [ ] Positions are read-only; no self-granting path exists
- [ ] Name and avatar changes update the top-bar chip without a reload
- [ ] The `Why?` link opens the simulator pre-filled
- [ ] Every noun from `useLabels()` (INV-001)
- [ ] Works at 390px

## Out of scope

| Not building | Why |
|---|---|
| Email change | Identity change; admin-only with audit (§Data contract) |
| Notification preferences | No channels exist yet (`63`) |
| Session/device list | Sessions are revocable server-side; a management UI has no demand |
| MFA enrolment | P3 at the earliest (`15` §9) |
| Requesting a position | A workflow, not a page. P3 if ever |
