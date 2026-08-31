// Organisation reads and the wizard's single commit. 13 § Organisation, 31, 50 §1.
import { estimateSeconds, resolveLabels } from '@endur/shared';
import type { LabelSet, OrgView, ResolvedLabels, SetupOrgBody, UpdateOrgBody } from '@endur/shared';
import type { Request } from 'express';
import { urlFor } from '../files/service.js';
import { prisma } from '../../db/client.js';
import { runInTransaction, type Tx } from '../../db/tx.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { grantsForLevel, levelForRole, presetFor } from '../../presets/index.js';
import { clearGrantCache } from '../../authz/index.js';

export async function readOrg(orgId: string): Promise<OrgView> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new NotFoundError('That organisation does not exist.');
  return view(org);
}

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
    // Merge, do not replace. The settings screen edits one key at a time (41), and a
    // whole-set write would silently drop every rename the org already had — the same
    // reasoning as resolveLabels() merging per key rather than per set (22 §3).
    const merged = { ...(current.labels as LabelSet), ...labels };
    const org = await tx.organization.update({ where: { id: orgId }, data: { labels: merged } });
    req.ctx.audit.push({ action: 'org.update', targetType: 'organization', targetId: orgId });
    return view(org);
  });
}

/**
 * The wizard's commit. ONE request, ONE transaction (31).
 *
 * Registration already built a minimal working org — a root unit, an Owner role, the
 * founder's position. Setup replaces that scaffolding with the real structure and moves
 * the founder onto it, so what comes out has exactly the roles and units that were chosen
 * and no leftovers from before the wizard ran.
 */
export async function setupOrg(
  req: Request,
  orgId: string,
  userId: string,
  body: SetupOrgBody,
): Promise<OrgView> {
  const preset = presetFor(body.industry);
  const root = validateStructure(body.units, resolveLabels(body.labels));

  return runInTransaction(req, async (tx) => {
    // Setup GENERATES the canonical objects; it is not a parallel store (CONF-008). Once
    // real data exists the structure pages own it, and re-running the generator would
    // silently discard work.
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

    // 1 · units, parents first, so a child always has a parent row to point at.
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

    // 2 · roles. LEVEL IS THE ARRAY INDEX (31) — index 0 is level 1, the most senior. A
    // client-supplied level and a client-supplied order can disagree, and then one of them
    // is silently wrong.
    const roleIds: string[] = [];
    for (const [index, role] of body.roles.entries()) {
      const created = await tx.node.create({
        data: { orgId, kind: 'role', name: role.name, level: index + 1 },
        select: { id: true },
      });
      roleIds.push(created.id);
    }

    // 3 · the derived grant matrix (50 §1). The four rows are POSITIONS IN THE FEEDBACK LOOP,
    // not positions in the list — L3 is the reviewee and L4 the respondent — so a ladder
    // longer than four maps its BOTTOM role to 4 and its middle to 3 (`DEC-112`). Counting
    // from the top put six roles of a ten-role college on the respondent row and left a
    // Professor with five capabilities.
    for (const [index, roleId] of roleIds.entries()) {
      const level = levelForRole(index, roleIds.length);
      await tx.grant.createMany({
        data: grantsForLevel(level).map((grant) => ({
          orgId,
          subjectId: roleId,
          capability: grant.capability,
          scope: grant.scope,
          effect: 'allow' as const,
          // Derived. Editing one in the powers grid clears this flag, so a later
          // regeneration cannot silently revert an administrator's change (10 §9).
          derived: true,
          createdById: userId,
        })),
        skipDuplicates: true,
      });
    }

    // 4 · move the founder onto the new structure: the most senior role, anchored at the
    // root. Powers come from the POSITION and never from the role (INV-005), so this is
    // the step that actually hands them the organisation.
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

    // 5 · remove the registration scaffolding. Cascades take its grants and edges with it,
    // which is exactly why the founder's new position is created first — otherwise there is
    // a statement in between where they hold nothing.
    if (scaffolding.length > 0) {
      await tx.node.deleteMany({ where: { orgId, id: { in: scaffolding.map((n) => n.id) } } });
    }

    // 6 · starter templates, so the organisation has something to launch on day one.
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

    // 7 · vocabulary, and the version bump. authzVersion is part of the grant cache key,
    // so raising it here invalidates every cached decision for this tenant instantly.
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
    // Belt and braces next to the authzVersion bump — but setup rewrites every grant in
    // the organisation, and a stale entry here would be the founder's very first click.
    clearGrantCache();
    return result;
  });
}

/**
 * Raise `settings.authzVersion`. Every write to nodes, edges or grants must go through
 * this in its own transaction: the version is part of the grant cache key, and a
 * permission change that does not bump it stays invisible for the cache's whole TTL —
 * which is a security bug, not a performance trade-off (11 §7).
 */
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

/**
 * Everything wrong with a submitted structure, found BEFORE the transaction opens. Failing
 * halfway through means the message is about a foreign key rather than about the form the
 * person is looking at.
 */
function validateStructure(
  units: SetupOrgBody['units'],
  labels: ResolvedLabels,
): SetupOrgBody['units'][number] {
  // The noun comes from the BODY, not from req.ctx (22 §6, T-044). This runs mid-wizard:
  // the words the reader is looking at are the ones they picked two steps ago, which the
  // database has not been told about yet. Reading the stored labels here would answer in
  // the vocabulary they are in the middle of replacing.
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

/** Parents before children, so unit creation never waits on a row that does not exist yet. */
function inParentOrder(units: SetupOrgBody['units']): SetupOrgBody['units'] {
  const done = new Set<string>();
  const out: SetupOrgBody['units'] = [];
  let remaining = [...units];
  while (remaining.length > 0) {
    const ready = remaining.filter(
      (unit) => unit.parentTempId === null || done.has(unit.parentTempId),
    );
    // Unreachable: a cycle was rejected above. Present so a future edit to the validation
    // cannot turn this into an infinite loop.
    if (ready.length === 0) break;
    for (const unit of ready) {
      out.push(unit);
      done.add(unit.tempId);
    }
    remaining = remaining.filter((unit) => !done.has(unit.tempId));
  }
  return out;
}

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
    // What /app checks before rendering: an unconfigured org's home is empty and confusing,
    // so the console redirects to the wizard instead (46 § Route & access).
    configured: typeof settings.setupCompletedAt === 'string',
    logoUrl: org.logoFileId ? urlFor(org.logoFileId) : null,
    createdAt: org.createdAt.toISOString(),
  };
}
