// The organisation's activity log: the first thing that ever READS the audit rows.
// The select below is an allow-list of six columns, and the IP address is deliberately not one of them.
import type { AuditEntry, AuditQuery, DecidedBy } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { visibleUnits, type Visibility } from '../../authz/index.js';
import { urlFor } from '../files/service.js';
import { decodeCursor, encodeCursor, type Paged } from '../../lib/paginate.js';

type Row = {
  id: bigint;
  createdAt: Date;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: string;
  decidedBy: unknown;
  requestId: string | null;
  actor: { id: string; name: string; avatarFileId: string | null } | null;
};

export async function readAudit(
  orgId: string,
  userId: string,
  authzVersion: number,
  query: AuditQuery,
): Promise<Paged<AuditEntry>> {
  const visibility = await visibleUnits({ orgId, userId, capability: 'audit.read', authzVersion });
  const scope = await scopeFilter(orgId, userId, visibility);
  // Nothing in scope: no query at all, and the total is 0 - it counts what the CALLER may see, not what exists.
  if (scope === null) {
    return { data: [], page: { nextCursor: null, hasMore: false }, meta: { total: 0 } };
  }

  const where = { orgId, ...filters(query), ...scope };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { ...where, ...after(query.cursor) },
      // The allow-list. Adding ip here is the one edit this file must never take.
      select: {
        id: true,
        createdAt: true,
        action: true,
        targetType: true,
        targetId: true,
        outcome: true,
        decidedBy: true,
        requestId: true,
        actor: { select: { id: true, name: true, avatarFileId: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const hasMore = rows.length > query.limit;
  const kept = hasMore ? rows.slice(0, query.limit) : rows;
  const names = await targetNames(orgId, kept);
  const last = kept.at(-1);

  return {
    data: kept.map((row) => entry(row, names)),
    page: {
      nextCursor:
        hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id.toString() }) : null,
      hasMore,
    },
    meta: { total },
  };
}

// Turns the query string filters into a database filter.
function filters(query: AuditQuery) {
  const at: { gte?: Date; lt?: Date } = {};
  if (query.from) at.gte = new Date(`${query.from}T00:00:00.000Z`);
  // An exclusive upper bound on the day AFTER 'to', so a one-day range actually contains that day.
  if (query.to) at.lt = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000);

  return {
    ...(query.actorId ? { actorUserId: query.actorId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(at.gte || at.lt ? { createdAt: at } : {}),
  };
}

// The shared cursor format, decoded by hand for one reason: this table's id is a bigint while every
// other table's is a uuid. The cursor stays the same shape, so a client cannot tell the two apart.
function after(cursor: string | undefined) {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: BigInt(id) } }],
  };
}

// Which rows this caller may see, or null for none at all.
// The filter is on the TARGET, not the actor: a row is visible when the thing acted upon is in scope,
// because an owner acting on your department is your business. Org-level targets - a role, a template,
// the organisation itself - are only visible to somebody whose grant covers the whole organisation.
async function scopeFilter(
  orgId: string,
  userId: string,
  visibility: Visibility,
): Promise<object | null> {
  if (visibility.all) return {};

  const unitIds = visibility.unitIds;
  if (unitIds.length === 0 && !visibility.self) return null;

  const [subjects, people, campaigns] = await Promise.all([
    prisma.subject.findMany({ where: { orgId, unitId: { in: unitIds } }, select: { id: true } }),
    prisma.node.findMany({
      where: { orgId, kind: 'position', unitId: { in: unitIds }, userId: { not: null } },
      select: { userId: true },
    }),
    prisma.campaign.findMany({
      where: { orgId, subjects: { some: { subject: { unitId: { in: unitIds } } } } },
      select: { id: true },
    }),
  ]);

  const personIds = [...new Set(people.map((row) => row.userId as string))];
  // A self grant reaches rows about the caller and nothing else.
  if (visibility.self) personIds.push(userId);

  return {
    OR: [
      { targetType: 'unit', targetId: { in: unitIds } },
      { targetType: 'subject', targetId: { in: subjects.map((row) => row.id) } },
      { targetType: { in: ['person', 'user'] }, targetId: { in: personIds } },
      { targetType: 'campaign', targetId: { in: campaigns.map((row) => row.id) } },
    ],
  };
}

// Names for the rows on this page, one query per kind.
// A row whose target has since been deleted still renders, with its id: a log that quietly drops those
// rows would be a log that can be edited by deleting things.
async function targetNames(orgId: string, rows: Row[]): Promise<Map<string, string>> {
  const idsOf = (type: string) =>
    [
      ...new Set(
        rows.filter((row) => row.targetType === type && row.targetId).map((row) => row.targetId!),
      ),
    ];

  const nodeIds = [...idsOf('unit'), ...idsOf('role')];
  const userIds = [...idsOf('person'), ...idsOf('user')];

  const [nodes, users, subjects, campaigns, templates] = await Promise.all([
    nodeIds.length
      ? prisma.node.findMany({ where: { orgId, id: { in: nodeIds } }, select: { id: true, name: true } })
      : [],
    userIds.length
      ? prisma.user.findMany({ where: { orgId, id: { in: userIds } }, select: { id: true, name: true } })
      : [],
    idsOf('subject').length
      ? prisma.subject.findMany({
          where: { orgId, id: { in: idsOf('subject') } },
          select: { id: true, name: true },
        })
      : [],
    idsOf('campaign').length
      ? prisma.campaign.findMany({
          where: { orgId, id: { in: idsOf('campaign') } },
          select: { id: true, name: true },
        })
      : [],
    idsOf('template').length
      ? prisma.template.findMany({
          where: { orgId, id: { in: idsOf('template') } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const names = new Map<string, string>();
  for (const row of [...nodes, ...users, ...subjects, ...campaigns, ...templates]) {
    names.set(row.id, row.name);
  }
  return names;
}

function entry(row: Row, names: Map<string, string>): AuditEntry {
  return {
    id: row.id.toString(),
    at: row.createdAt.toISOString(),
    actor: row.actor
      ? {
          id: row.actor.id,
          name: row.actor.name,
          avatarUrl: row.actor.avatarFileId ? urlFor(row.actor.avatarFileId) : null,
        }
      : null,
    action: row.action,
    target: row.targetType
      ? {
          type: row.targetType,
          id: row.targetId,
          name: row.targetId ? (names.get(row.targetId) ?? null) : null,
        }
      : null,
    outcome: row.outcome === 'denied' ? 'denied' : 'allowed',
    decidedBy: (row.decidedBy as DecidedBy | null) ?? null,
    requestId: row.requestId,
  };
}
