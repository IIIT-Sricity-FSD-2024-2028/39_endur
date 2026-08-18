// Registration builds a WORKING organisation in ONE transaction: org, root unit, an
// Owner role, the founder's user + person node, their position, the membership edge, and
// the level-1 grants. Partially-created orgs are the worst possible failure here — a user
// who exists but cannot see anything, with no way to retry because their email is taken.
import { prisma } from '../../db/client.js';
import { hashPassword } from '../../auth/password.js';
import { grantsForLevel } from '../../presets/grant-matrix.js';
import { ConflictError } from '../../lib/errors.js';
import { DEFAULT_LABELS } from '@endur/shared';
import type { RegisterBody } from '@endur/shared';

export async function register(input: RegisterBody) {
  const passwordHash = await hashPassword(input.password);
  const slug = await uniqueSlug(input.orgName);

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName,
        slug,
        industry: input.industry,
        // T-015 replaces these with the chosen preset's vocabulary. The Custom set is a
        // working default, never a blank one — a blank start is the enemy (50 §1).
        labels: DEFAULT_LABELS,
        settings: { authzVersion: 1 },
      },
    });

    const user = await tx.user.create({
      data: { orgId: org.id, email: input.email, name: input.name, passwordHash },
    });

    const unit = await tx.node.create({
      data: { orgId: org.id, kind: 'unit', name: input.orgName },
    });
    const role = await tx.node.create({
      data: { orgId: org.id, kind: 'role', name: 'Owner', level: 1 },
    });
    const person = await tx.node.create({
      data: { orgId: org.id, kind: 'person', name: input.name, userId: user.id },
    });
    const position = await tx.node.create({
      data: { orgId: org.id, kind: 'position', name: `Owner — ${input.orgName}`,
              roleId: role.id, unitId: unit.id },
    });
    await tx.edge.create({
      data: { orgId: org.id, type: 'member', parentId: person.id, childId: position.id,
              isPrimary: true },
    });

    // Level-1 grants, on the ROLE. Anchoring comes from the position at resolve time —
    // that is INV-005, and it is why these rows carry no unit of their own.
    await tx.grant.createMany({
      data: grantsForLevel(1).map((grant) => ({
        orgId: org.id, subjectId: role.id, capability: grant.capability,
        scope: grant.scope, effect: 'allow' as const, derived: true, createdById: user.id,
      })),
    });

    return { org, user };
  });
}

async function uniqueSlug(name: string): Promise<string> {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  throw new ConflictError('Could not derive a unique address for that organisation name.');
}
