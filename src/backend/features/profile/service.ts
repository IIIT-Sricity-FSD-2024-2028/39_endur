// The caller acting on themselves.
// Every function here takes the signed-in user's id and NO target id: there is no parameter that could
// be pointed at another person. The administrator's versions of these writes live under /people/:id.
import type { Request } from 'express';
import type { ChangePasswordBody, ProfileView, UpdateProfileBody } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { runInTransaction } from '../../db/tx.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../auth/password.js';
import { readPerson, updatePerson } from '../people/service.js';
import { urlFor } from '../files/service.js';

// The caller's person node, looked up from the principal and never from the request.
// An account with no person node means somebody was never placed in the organisation, so 404 is the honest answer.
async function personOf(orgId: string, userId: string): Promise<string> {
  const person = await prisma.node.findFirst({
    where: { orgId, kind: 'person', userId },
    select: { id: true },
  });
  if (!person) throw new NotFoundError('Your record in this organization could not be found.');
  return person.id;
}

// Read through the same function the people page uses, not around it, so the two screens can never
// disagree about the same person - and the self clause of the visibility filter is exercised on every load.
export async function readProfile(
  orgId: string,
  userId: string,
  authzVersion: number,
): Promise<ProfileView> {
  const personId = await personOf(orgId, userId);
  const [person, user] = await Promise.all([
    readPerson(orgId, personId, userId, authzVersion),
    prisma.user.findFirst({
      where: { id: userId, orgId },
      select: { id: true, name: true, email: true, avatarFileId: true, lastLoginAt: true },
    }),
  ]);
  if (!user) throw new AppError('UNAUTHENTICATED', 'Your account no longer exists.');

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarFileId ? urlFor(user.avatarFileId) : null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    },
    positions: person.positions,
    powersByPlace: person.powersByPlace,
    // readPerson() recognises that the caller IS this person and hands back the unfiltered
    // list. That recognition lives there rather than here for the usual reason: this page
    // reads THROUGH the people page's function, never around it.
    involvement: person.involvement,
  };
}

// Name only, and through the shared update, because a name lives in two tables and writing one of them
// is how somebody renames themselves while the people list keeps the old name.
export async function updateProfile(
  req: Request,
  orgId: string,
  userId: string,
  authzVersion: number,
  body: UpdateProfileBody,
): Promise<ProfileView> {
  const personId = await personOf(orgId, userId);
  await updatePerson(req, orgId, personId, userId, authzVersion, { name: body.name });
  return readProfile(orgId, userId, authzVersion);
}

// Changing your own password. The current one is verified first, and a wrong one is a FIELD error,
// not a 401 - a 401 from inside the console would sign the person out for a typo.
// There is no path here that sets a first password: that is what activation is for.
export async function changePassword(
  req: Request,
  orgId: string,
  userId: string,
  body: ChangePasswordBody,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, orgId },
    // The only place besides login that reads the password hash.
    select: { id: true, passwordHash: true },
  });
  if (!user) throw new AppError('UNAUTHENTICATED', 'Your account no longer exists.');

  const ok = await verifyPassword(user.passwordHash, body.currentPassword);
  if (!ok) {
    // A field-shaped error, so the message appears under the current-password input rather than in a toast.
    throw new AppError('VALIDATION_FAILED', 'That is not your current password.', {
      fields: [{ path: 'body.currentPassword', message: 'That is not your current password.' }],
    });
  }

  // Saying so costs one comparison, and the person is holding both strings anyway.
  if (body.newPassword === body.currentPassword) {
    throw new AppError('VALIDATION_FAILED', 'That is the password you already have.', {
      fields: [{ path: 'body.newPassword', message: 'Choose a different password.' }],
    });
  }

  const passwordHash = await hashPassword(body.newPassword);
  await runInTransaction(req, async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    // A credential changed, so the log says THAT it changed and nothing about either value.
    req.ctx.audit.push({ action: 'account.password', targetType: 'user', targetId: user.id });
  });
}
