// The caller's own account. 47, 13 § Profile, 14 §2.
//
// EVERY SHAPE HERE IS ABOUT THE PRINCIPAL AND CARRIES NO ID. That is the point of the file
// rather than an accident of it: `/profile` resolves under `self` scope (`11` §4), and a
// route with no id in the request has nothing for a caller to point somewhere else. The
// same writes exist on `/people/:id` for an administrator acting on somebody else, and
// there they DO take an id and a wider scope — two questions, two routes.
import { z } from 'zod';
import { dto, nameField } from './common.js';
import type { PersonCampaign, PersonSummary, PowersAtPlace } from './person.js';

/**
 * NAME ONLY, AND THE ABSENCE OF `email` IS THE SPECIFICATION (47 § Data contract).
 *
 * Changing an address is an identity change: it moves where a password reset lands and it
 * is the first move in an account takeover. It belongs to an administrator on
 * `PATCH /people/:id`, where it is bounded by scope and written to the audit log with a
 * name against it. A self-service email change has neither.
 */
export const UpdateProfileBody = z.object({
  name: nameField(120),
});
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

/**
 * THE CURRENT PASSWORD IS REQUIRED, and the reason is not the one people usually give.
 *
 * It is not about confirming intent. It is that a logged-in session left unattended must
 * not be enough to LOCK THE REAL OWNER OUT — without this field, ninety seconds at somebody
 * else's desk takes their account permanently, and the session cookie is `httpOnly` and
 * rolling, so such a session is a normal thing to find. The other two reasons follow from
 * it: it re-proves the person at the keyboard is the account holder before a credential
 * changes, and it makes a stolen session strictly less valuable than a stolen password.
 *
 * Deliberately NOT capability-gated (13 § Profile). Proving you hold the session IS the
 * authorisation, and there is no capability that could express it — `person.update: self`
 * would be a lie, because an administrator holding `person.update` over somebody else's
 * subtree must NOT be able to set their password (`57` § "Why an administrator still cannot
 * set a password"). The absence of a capability line on this route is load-bearing.
 *
 * `newPassword` carries the same floor as `Credentials.password` — ten characters, no
 * composition rules (15 § Password handling). A weaker rule here would make "change your
 * password" a way to get a password registration would have refused.
 */
export const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBody>;

export const UpdateProfileDto = dto({ body: UpdateProfileBody });
export const ChangePasswordDto = dto({ body: ChangePasswordBody });

/**
 * What `/app/profile` paints.
 *
 * `positions` and `powersByPlace` are the SAME TYPES `/people/:id` returns, not lookalikes
 * (`person.ts`). 47's sketch gave `powersByPlace` a bare `capabilities: string[]` and its
 * own position shape; both were narrowed versions of what `PersonDetail` already had, and
 * taking them literally would have forked `<PowersByPlace>` into two renderers for one
 * screen apiece — the second implementation N-005 exists to prevent, arriving in the
 * component layer instead of the resolver. The doc was amended to match the code (T-051).
 *
 * 47's third row, "Anywhere else — nothing", is NOT a row here. It is a sentence the
 * renderer writes when it has finished listing the places, and inventing a null-unit entry
 * to carry it would put a place in the data that the organisation does not have.
 */
export type ProfileView = {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    /** `null` until the second sign-in — a freshly activated account has never logged in. */
    lastLoginAt: string | null;
  };
  positions: PersonSummary['positions'];
  powersByPlace: PowersAtPlace[];
  /**
   * WHAT YOU ARE BEING ASKED FOR — the same `PersonCampaign[]` `/people/:id` returns about
   * somebody else, for the same reason `positions` and `powersByPlace` are shared: one
   * shape, one renderer (`N-005`).
   *
   * ONE DIFFERENCE, AND IT IS NOT COSMETIC. The administrator's copy is filtered by their
   * `campaign.read` scope; this one is not filtered at all. `campaign.read` is an
   * ADMINISTRATIVE capability — it is what lets somebody manage a campaign — and gating
   * your own list on it would hide "what am I supposed to fill in" from exactly the people
   * being asked to fill it in, which is the whole population the feature is for. `self` is
   * the correct scope and it is already the scope this route resolves under (`11` §4).
   */
  involvement: PersonCampaign[];
};
