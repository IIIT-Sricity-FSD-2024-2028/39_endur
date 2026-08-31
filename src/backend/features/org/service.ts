// Reading the organisation, renaming it, changing its vocabulary, and the setup wizard's one commit.
import { estimateSeconds, resolveLabels } from '@endur/shared';
import type { LabelSet, OrgView, ResolvedLabels, SetupOrgBody, UpdateOrgBody } from '@endur/shared';
import type { Request } from 'express';
import { urlFor } from '../files/service.js';
import { prisma } from '../../db/client.js';
import { runInTransaction, type Tx } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { grantsForLevel, levelForRole, presetFor } from '../../presets/index.js';
import { clearGrantCache } from '../../authz/index.js';

// The organisation, as the console reads it.
export async function readOrg(orgId: string): Promise<OrgView> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new NotFoundError('That organisation does not exist.');
  return view(org);
}

// Rename the organisation or change its industry.
export async function updateOrg(
  req: Request,
  orgId: string,
  body: UpdateOrgBody,
): Promise<OrgView> {
  return runInTransaction(req, async (tx) => {
    const org = await tx.organization.update({
      where: { id: orgId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.industry ? { industry: body.industry } : {}),
      },
    });
    req.ctx.audit.push({ action: 'org.update', targetType: 'organization', targetId: orgId });
    return view(org);
  });
}

// Change one or more of the organisation's words for its own things.
export async function updateLabels(
  req: Request,
  orgId: string,
  labels: LabelSet,
): Promise<OrgView> {
  return runInTransaction(req, async (tx) => {
    const current = await tx.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { labels: true },
    });
    // Merge, do not replace: the settings screen edits one word at a time, and a full write would drop the others.
    const merged = { ...(current.labels as LabelSet), ...labels };
    const org = await tx.organization.update({ where: { id: orgId }, data: { labels: merged } });
    req.ctx.audit.push({ action: 'org.update', targetType: 'organization', targetId: orgId });
    return view(org);
  });
}

// The setup wizard's commit: one request, one transaction.
// Registration already made a minimal org; this replaces that scaffolding with the real structure
// and moves the founder onto it, so nothing is left over from before the wizard ran.
export async function setupOrg(
  req: Request,
  orgId: string,
  userId: string,
  body: SetupOrgBody,
): Promise<OrgView> {
  const preset = presetFor(body.industry);
  const root = validateStructure(body.units, resolveLabels(body.labels));

  return runInTransaction(req, async (tx) => {
    // Setup only ever GENERATES the first structure. Once real data exists, the structure pages own it.
    const [subjects, campaigns] = await Promise.all([
      tx.subject.count({ where: { orgId } }),
      tx.campaign.count({ where: { orgId } }),
    ]);
    if (subjects > 0 || campaigns > 0) {
      throw new ConflictError(
        'This organisation already has data. Edit the structure directly rather than running setup again.',
      );
    }

    const scaffolding = await tx.node.findMany({
      where: { orgId, meta: { path: ['seededBy'], equals: 'register' } },
      select: { id: true },
    });

    // 1. Units, parents first, so a child always has a parent row to point at.
    const unitIds = new Map<string, string>();
    for (const unit of inParentOrder(body.units)) {
      const created = await tx.node.create({
        data: { orgId, kind: 'unit', name: unit.name },
        select: { id: true },
      });
      unitIds.set(unit.tempId, created.id);
    }
    for (const unit of body.units) {
      if (unit.parentTempId === null) continue;
      await tx.edge.create({
        data: {
          orgId,
          type: 'contains',
          parentId: unitIds.get(unit.parentTempId) as string,
          childId: unitIds.get(unit.tempId) as string,
        },
      });
    }
    const rootUnitId = unitIds.get(root.tempId) as string;

    // 2. Roles. The array order IS the level: index 0 is level 1, the most senior.
    const roleIds: string[] = [];
    for (const [index, role] of body.roles.entries()) {
      const created = await tx.node.create({
        data: { orgId, kind: 'role', name: role.name, level: index + 1 },
        select: { id: true },
      });
      roleIds.push(created.id);
    }

    // 3. The seeded grants for each role. The four levels are places in the feedback loop, not places in the list,
    // so a longer ladder maps its bottom role to level 4 and everyone in the middle to level 3.
    for (const [index, roleId] of roleIds.entries()) {
      const level = levelForRole(index, roleIds.length);
      await tx.grant.createMany({
        data: grantsForLevel(level).map((grant) => ({
          orgId,
          subjectId: roleId,
          capability: grant.capability,
          scope: grant.scope,
          effect: 'allow' as const,
          // Marked derived. Editing a cell in the powers grid clears the flag, so nothing later overwrites that change.
          derived: true,
          createdById: userId,
        })),
        skipDuplicates: true,
      });
    }

    // 4. Move the founder onto the new structure: the top role, at the root unit. Powers come from the POSITION.
    const person = await tx.node.findFirst({
      where: { orgId, kind: 'person', userId },
      select: { id: true },
    });
    if (!person) throw new NotFoundError('Your person record is missing from this organisation.');

    const position = await tx.node.create({
      data: {
        orgId,
        kind: 'position',
        name: `${body.roles[0]?.name ?? 'Owner'} — ${root.name}`,
        roleId: roleIds[0] as string,
        unitId: rootUnitId,
      },
      select: { id: true },
    });
    await tx.edge.create({
      data: { orgId, type: 'member', parentId: person.id, childId: position.id, isPrimary: true },
    });

    // 5. Remove the registration scaffolding. Done AFTER the new position exists, so they are never left holding nothing.
    if (scaffolding.length > 0) {
      await tx.node.deleteMany({ where: { orgId, id: { in: scaffolding.map((n) => n.id) } } });
    }

    // 6. Starter templates, so the organisation has something to launch on day one.
    if (body.includeTemplates) {
      for (const seed of preset.templates) {
        await tx.template.create({
          data: {
            orgId,
            name: seed.name,
            category: seed.category,
            industry: preset.key,
            description: seed.description ?? null,
            estimatedSeconds: estimateSeconds(seed.questions.map((question) => question.kind)),
            questions: {
              create: seed.questions.map((question, index) => ({
                kind: question.kind,
                text: question.text,
                config: question.config,
                required: question.required,
                position: index,
              })),
            },
          },
        });
      }
    }

    // 7. Vocabulary, plus the permission version bump that invalidates every cached decision for this org.
    const settings = await bumpVersion(tx, orgId, {
      setupCompletedAt: new Date().toISOString(),
    });
    const org = await tx.organization.update({
      where: { id: orgId },
      data: { industry: body.industry, labels: body.labels, settings: settings as never },
    });

    req.ctx.audit.push({ action: 'org.update', targetType: 'organization', targetId: orgId });
    return view(org);
  }).then((result) => {
    // Belt and braces beside the version bump: setup rewrites every grant, and a stale entry would hit the founder's first click.
    clearGrantCache();
    return result;
  });
}

// Raises settings.authzVersion. Every write to nodes, edges or grants must go through this,
// because the version is part of the grant cache key - a change that skips it stays invisible for the cache's lifetime.
export async function bumpVersion(
  tx: Tx,
  orgId: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { settings: true },
  });
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const current = typeof settings.authzVersion === 'number' ? settings.authzVersion : 0;
  return { ...settings, ...extra, authzVersion: current + 1 };
}

// Checks a submitted structure BEFORE the transaction opens, so the error names the form and not a foreign key.
function validateStructure(
  units: SetupOrgBody['units'],
  labels: ResolvedLabels,
): SetupOrgBody['units'][number] {
  // The nouns come from the submitted body, not the stored labels: mid-wizard, the reader is looking at words the database has not been told about yet.
  const unit = labels.unit.one.toLowerCase();
  const units_ = labels.unit.many.toLowerCase();
  const tempIds = new Set(units.map((unit) => unit.tempId));
  if (tempIds.size !== units.length) {
    throw new ConflictError(`Two ${units_} in that structure share the same id.`);
  }
  const roots = units.filter((unit) => unit.parentTempId === null);
  if (roots.length !== 1) {
    throw new ConflictError(`The structure needs exactly one top-level ${unit}.`);
  }
  for (const unit of units) {
    if (unit.parentTempId !== null && !tempIds.has(unit.parentTempId)) {
      throw new ConflictError(`"${unit.name}" points at a parent that is not in the structure.`);
    }
  }
  if (hasCycle(units)) throw new ConflictError('That structure loops back on itself.');
  return roots[0] as SetupOrgBody['units'][number];
}

// Sorts units so parents come before their children.
function inParentOrder(units: SetupOrgBody['units']): SetupOrgBody['units'] {
  const done = new Set<string>();
  const out: SetupOrgBody['units'] = [];
  let remaining = [...units];
  while (remaining.length > 0) {
    const ready = remaining.filter(
      (unit) => unit.parentTempId === null || done.has(unit.parentTempId),
    );
    // Unreachable, since cycles were rejected above; kept so a future edit cannot cause an endless loop.
    if (ready.length === 0) break;
    for (const unit of ready) {
      out.push(unit);
      done.add(unit.tempId);
    }
    remaining = remaining.filter((unit) => !done.has(unit.tempId));
  }
  return out;
}

// Does any unit list itself as its own ancestor?
function hasCycle(units: SetupOrgBody['units']): boolean {
  const parents = new Map(units.map((unit) => [unit.tempId, unit.parentTempId]));
  for (const unit of units) {
    const seen = new Set<string>([unit.tempId]);
    let current = unit.parentTempId;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parents.get(current) ?? null;
    }
  }
  return false;
}

// Turns an organisation row into the shape the client expects.
function view(org: {
  id: string;
  name: string;
  slug: string;
  industry: string;
  labels: unknown;
  settings: unknown;
  logoFileId?: string | null;
  createdAt: Date;
}): OrgView {
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    industry: org.industry,
    labels: resolveLabels(org.labels as LabelSet),
    // What the console checks before rendering: an unconfigured org is sent to the wizard instead of an empty home page.
    configured: typeof settings.setupCompletedAt === 'string',
    logoUrl: org.logoFileId ? urlFor(org.logoFileId) : null,
    createdAt: org.createdAt.toISOString(),
  };
}
