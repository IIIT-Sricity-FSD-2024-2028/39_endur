// Builds the OpenAPI document by walking the running app, so it cannot drift from the code.
// Request schemas come from validate(), required capabilities from requireCapability(),
// and the "who holds this" tables from the same grant matrix that seeds real organisations.
import type { Express } from 'express';
import { ERROR_CODES, PLATFORM_CAPABILITY_CATALOGUE, type PlatformCapability } from '@endur/shared';
import { GRANT_MATRIX, type Level } from '../presets/grant-matrix.js';
import { enumerateRoutes, openApiPath, pathParams, routeKey } from '../lib/routeTable.js';
import { defineRef, splitDto, toJsonSchema, type ConvertContext, type JsonSchema } from './zodSchema.js';
import { RESPONSES, type ResponseSpec } from './responses.js';
import { UnitNodeSchema } from './components.js';

// Named schemas. Only one is needed: UnitNode contains UnitNodes, and JSON Schema needs a name for that loop.
const REFS = new Map<Parameters<typeof toJsonSchema>[0], string>([[UnitNodeSchema, 'UnitNode']]);
const CTX: ConvertContext = { refs: REFS };

const VERSION = '1.0.0';

// The seeded role levels, in words. A lower number means more senior.
const LEVEL_NAMES: Record<Level, string> = {
  1: 'L1 — the top role (Principal / General Manager / Owner)',
  2: 'L2 — a head of a unit (Section Head / Department Head)',
  3: 'L3 — a member of staff (Tutor / Supervisor)',
  4: 'L4 — the most junior role (Learner / Guest)',
};

// Describes which seeded roles hold a capability, read from the matrix that actually creates the grants.
// It is only a starting point: every organisation re-decides this on its own powers grid.
function rolesFor(capability: string): string {
  const row = GRANT_MATRIX[capability as keyof typeof GRANT_MATRIX];
  if (!row) {
    return (
      '**No seeded role holds this by default.** An administrator must grant it on the ' +
      'powers grid (`/app/settings/powers`) before anybody can call this route.'
    );
  }
  const held = ([1, 2, 3, 4] as Level[])
    .filter((level) => row[level])
    .map((level) => `- ${LEVEL_NAMES[level]} — at scope \`${row[level] as string}\``);
  return [
    '**Seeded to:**',
    ...held,
    '',
    'A *default*, not the rule. Every organisation re-decides this on its own powers grid, and ' +
      'the resolver is asked on every request — so a role that holds this here may not hold it ' +
      'in a given organisation, and vice versa.',
  ].join('\n');
}

// The platform side has no resolver: two fixed operator roles and a lookup.
function operatorRolesFor(capability: string): string {
  const entry = PLATFORM_CAPABILITY_CATALOGUE[capability as PlatformCapability];
  if (!entry) return '';
  const roles = entry.roles.map((role) => `\`${role}\``).join(' · ');
  return [
    `**Operator roles:** ${roles}`,
    '',
    entry.note,
    '',
    'Platform capabilities are a **separate catalogue** from the organisation one (`19` §4). ' +
      'They can never be granted to a customer, and no tier entitles one — a test asserts both.',
  ].join('\n');
}

// The error envelope every non-2xx reply in the product uses.
const ERROR_ENVELOPE: JsonSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', enum: Object.keys(ERROR_CODES) },
        message: {
          type: 'string',
          description:
            'Renders verbatim in the UI, and is written in the ORGANISATION’S OWN VOCABULARY — ' +
            '"That department does not exist" in a company, "That property does not exist" in a ' +
            'hotel. The server produces user-facing strings too (INV-001).',
        },
        requestId: {
          type: 'string',
          description: 'Echoes `X-Request-Id`. The one string that ties a user report to a log line.',
        },
        details: {
          type: 'object',
          description:
            'Shape depends on the code. `fields[]` on a 422; `decidedBy` on a 403, naming the ' +
            'grant that refused — which is what tells the caller whom to ask; `requiredTier` on a 402.',
          additionalProperties: true,
        },
      },
    },
  },
};

// The failures worth documenting for one route, picked from what that route actually is.
function errorsFor(route: {
  method: string;
  capabilities: string[];
  platform: string[];
  hasDto: boolean;
  path: string;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const add = (status: string, description: string): void => {
    out[status] = {
      description,
      content: { 'application/json': { schema: ERROR_ENVELOPE } },
    };
  };

  if (route.hasDto) add('422', 'The request failed validation. `details.fields[]` addresses each bad field by its dotted path, so the UI can render the message beside the input.');
  if (route.capabilities.length > 0 || route.platform.length > 0 || route.path.startsWith('/api/v1/platform')) {
    add('401', 'No session, or the session has ended. The platform surface answers this without the `endur.ops` cookie.');
  }
  if (route.capabilities.length > 0) {
    add(
      '403',
      'The caller holds the capability but not **here** — or holds an explicit deny, which beats an allow ' +
        'unconditionally (INV-004). `details.decidedBy` names the grant that decided, which is what makes the ' +
        'refusal actionable rather than merely final.',
    );
    add(
      '404',
      '**Also what a caller who may not SEE the resource gets** (`13` §5). A 403 there would confirm the row ' +
        'exists and leak the organisation’s structure to somebody outside it, so invisibility and absence are ' +
        'deliberately indistinguishable.',
    );
  }
  if (route.platform.length > 0) {
    add('403', 'The operator’s role does not hold this capability. The message names it — the reader is an Endur employee who already knows the catalogue.');
  }
  if (!['GET', 'HEAD'].includes(route.method) && !route.path.startsWith('/api/v1/platform')) {
    add('403', 'CSRF: `X-CSRF-Token` was missing or did not match the `endur.csrf` cookie (`CSRF_FAILED`).');
  }
  add('429', 'Rate limited. The global per-IP limiter, or a scoped one on this route.');
  return out;
}

// The headers a caller may or must send on this route.
function headersFor(route: { method: string; path: string }): unknown[] {
  const headers: unknown[] = [
    {
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description:
        'Optional. Supply one to correlate your own logs with the server’s; the response echoes it, and so does every error body.',
    },
  ];

  const isPlatform = route.path.startsWith('/api/v1/platform');
  const isPublic = route.path.startsWith('/api/v1/public') || route.path.startsWith('/api/v1/files');
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(route.method);

  if (mutating && !isPlatform && !isPublic) {
    headers.push({
      name: 'X-CSRF-Token',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description:
        '**Required on every mutation made with a cookie session.** Echo the readable `endur.csrf` cookie. ' +
        'It exists because auth is a cookie rather than a bearer token (DEC-014) — the honest cost of that ' +
        'choice, paid here. The platform and respondent surfaces are exempt and say why in their own sections.',
    });
  }

  if (route.path.startsWith('/api/v1/auth')) {
    headers.push({
      name: 'X-Org-Slug',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      description:
        'Names the organisation. **Honoured ONLY on `/auth` routes**, because that is the one place the caller ' +
        'holds no credential — so a header cannot widen access somebody already has. Everywhere else the tenant ' +
        'comes from the session and never from the request (INV-010).',
    });
  }

  return headers;
}

// Which section of the document a path belongs under.
const TAGS: Array<[RegExp, string]> = [
  [/^\/api\/v1\/auth/, 'Auth'],
  [/^\/api\/v1\/org/, 'Organisation'],
  [/^\/api\/v1\/units/, 'Structure'],
  [/^\/api\/v1\/(roles|grants|authz)/, 'Roles & powers'],
  [/^\/api\/v1\/people/, 'People & accounts'],
  [/^\/api\/v1\/profile/, 'Profile'],
  [/^\/api\/v1\/subjects/, 'Subjects'],
  [/^\/api\/v1\/templates/, 'Templates'],
  [/^\/api\/v1\/campaigns/, 'Campaigns & results'],
  [/^\/api\/v1\/inbox/, 'Inbox'],
  [/^\/api\/v1\/analysis/, 'Analysis'],
  [/^\/api\/v1\/(reflect|checkins)/, 'Improve'],
  [/^\/api\/v1\/announcements/, 'Announcements'],
  [/^\/api\/v1\/(bookables|bookings)/, 'Booking'],
  [/^\/api\/v1\/home/, 'Home'],
  [/^\/api\/v1\/audit/, 'Activity log'],
  [/^\/api\/v1\/billing/, 'Plan & billing'],
  [/^\/api\/v1\/files/, 'Files'],
  [/^\/api\/v1\/public/, 'Respondent surface'],
  [/^\/api\/v1\/platform/, 'Platform (Endur operators)'],
];

// The tag for one path.
const tagFor = (path: string): string =>
  TAGS.find(([pattern]) => pattern.test(path))?.[1] ?? 'System';

// Which credential a path needs. The four worlds have four different answers.
function securityFor(path: string, guarded: boolean): unknown[] {
  if (path.startsWith('/api/v1/platform')) return [{ operatorSession: [] }];
  if (path.startsWith('/api/v1/public') || path === '/healthz') return [];
  if (path.startsWith('/api/v1/files')) return [];
  return guarded || path.startsWith('/api/v1/auth') ? [{ staffSession: [] }] : [{ staffSession: [] }];
}

// The long description shown for one operation, including who is allowed to call it.
function describe(route: {
  path: string;
  capabilities: string[];
  platform: string[];
  spec: ResponseSpec;
}): string {
  const parts = [route.spec.summary, ''];

  if (route.capabilities.length > 0) {
    parts.push('---', '', '### Access');
    for (const capability of route.capabilities) {
      parts.push(`**Capability required:** \`${capability}\``, '');
      parts.push(rolesFor(capability), '');
    }
    if (route.capabilities.length > 1) {
      parts.push(
        '**Both are required**, not either — this route returns content that two different ' +
          'capabilities each govern a part of.',
        '',
      );
    }
    parts.push(
      'Authorisation is decided by `requireCapability()` in the middleware chain, never inside the ' +
        'handler and never in the client (INV-003). The API returns only what the caller may see; the UI ' +
        'trusts it.',
    );
  } else if (route.platform.length > 0) {
    parts.push('---', '', '### Access');
    for (const capability of route.platform) {
      parts.push(`**Platform capability required:** \`${capability}\``, '');
      parts.push(operatorRolesFor(capability), '');
    }
  } else {
    parts.push('---', '', '### Access', '');
    parts.push(
      '**No capability.** Either the route authenticates (login, activation, the respondent surface) or ' +
        'what authorises it cannot be expressed as a capability — see the reason in `routes.test.ts`’ ' +
        '`PUBLIC_ROUTES`, where every one of these is listed with an argument.',
    );
  }

  return parts.join('\n');
}

// Assembles the whole document: one operation per mounted route, plus the shared components.
export function buildOpenApiDocument(app: Express): Record<string, unknown> {
  const routes = enumerateRoutes(app);
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const spec = RESPONSES[routeKey(route)];
    // A route with no documented response is skipped here, and openapi.test.ts names it as a failure.
    if (!spec) continue;

    const url = openApiPath(route.path);
    const parts = route.dto ? splitDto(route.dto) : {};
    const parameters: unknown[] = [...headersFor(route)];

    // Path parameters come from the PATH itself, with their schemas taken from the DTO where it has them.
    for (const name of pathParams(route.path)) {
      const fromDto = parts.params?.properties?.[name];
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema: fromDto ?? { type: 'string' },
      });
    }

    for (const [name, schema] of Object.entries(parts.query?.properties ?? {})) {
      parameters.push({
        name,
        in: 'query',
        required: (parts.query?.required ?? []).includes(name),
        schema,
      });
    }

    const success: Record<string, unknown> = {
      description: spec.status === 204 ? 'No content.' : 'Success.',
      ...(spec.schema
        ? { content: { 'application/json': { schema: toJsonSchema(spec.schema, '', CTX) } } }
        : spec.contentType
          ? { content: { [spec.contentType]: { schema: { type: 'string', format: 'binary' } } } }
          : {}),
    };

    const operation: Record<string, unknown> = {
      tags: [tagFor(route.path)],
      summary: spec.summary.split('.')[0] ?? spec.summary,
      description: describe({ ...route, spec }),
      parameters,
      security: securityFor(route.path, route.guarded),
      responses: {
        [String(spec.status)]: success,
        ...errorsFor({ ...route, hasDto: Boolean(parts.body || parts.query) }),
      },
      ...(route.capabilities.length > 0 ? { 'x-capability': route.capabilities } : {}),
      ...(route.platform.length > 0 ? { 'x-platform-capability': route.platform } : {}),
    };

    if (parts.body) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: parts.body } },
      };
    }

    paths[url] ??= {};
    paths[url][route.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Endur API',
      version: VERSION,
      description: [
        'Feedback management and performance analysis, generic across organisation types.',
        '',
        '**The one idea:** the organisation is *data*, not code. **No table is named after any',
        'industry’s own vocabulary, and neither is any role** (INV-002) — there is a graph of nodes',
        'and edges plus a set of grants saying who may do what, where. A university, a hotel and a',
        'hospital are the same rows with different names.',
        '',
        'Two consequences visible in this document:',
        '',
        '- **Every domain noun is a label.** Error messages come back in the organisation’s own',
        '  vocabulary. The same 404 says "department" for a company and "property" for a hotel.',
        '- **Permissions are grants, not levels.** Each operation below names the capability it needs',
        '  and the seeded roles that hold it — read from the matrix that actually seeds them.',
        '',
        '### The four worlds',
        '',
        'They have different authentication, different principals and different rules, and the',
        'document is tagged accordingly:',
        '',
        '| World | Credential | Notes |',
        '|---|---|---|',
        '| **Console** (`/api/v1/*`) | `endur.sid` cookie + `X-CSRF-Token` | Staff. Every route behind `requireCapability()` |',
        '| **Respondent** (`/api/v1/public/*`) | the token in the path | No account, ever. No CSRF — there is no ambient authority to abuse |',
        '| **Files** (`/api/v1/files/*`) | the unguessable id | Logos and avatars, rendered on phones with no session |',
        '| **Platform** (`/api/v1/platform/*`) | `endur.ops` cookie | Endur’s own operators. A separate account table and a separate capability catalogue |',
        '',
        '### Anonymity is in the schema, not in a setting',
        '',
        'The `responses` table has **no column that could identify a respondent**, and it never will.',
        'A separate `invitations` table records *that* a token was used; nothing joins the two. So the',
        'API can report "312 of 400 responded" and still not know whose answer is whose. Below the',
        'k-anonymity threshold, results bodies have **no `questions` key at all** — suppression is the',
        'absence of the data rather than a flag a client is trusted to honour.',
        '',
        '### How this document is produced',
        '',
        'It is **generated from the running application**, not written by hand. Request schemas are the',
        'Zod DTOs `validate()` actually parses each request against; capabilities are the strings',
        '`requireCapability()` was actually called with; role tables are read from the seeded grant',
        'matrix. A route added without a guard fails one test and a route added without a documented',
        'response fails another, so this cannot fall behind the code without a red build.',
      ].join('\n'),
    },
    servers: [
      { url: '/', description: 'This server' },
      { url: 'http://localhost:4000', description: 'Local development' },
    ],
    tags: [...new Set(TAGS.map(([, tag]) => tag)), 'System'].map((name) => ({ name })),
    components: {
      securitySchemes: {
        staffSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'endur.sid',
          description: [
            'The staff session — an **httpOnly cookie**, set by `POST /auth/login`.',
            '',
            'Cookies rather than a bearer token (DEC-014): no silent-refresh dance, no token sitting in',
            'JavaScript where XSS can read it, and revocation is a `DELETE` rather than a blocklist. The',
            'honest cost is that CSRF becomes real — which is why mutating routes require `X-CSRF-Token`.',
            '',
            '`sameSite: lax`, not `strict`: Strict would drop the cookie when arriving from an email link,',
            'which is exactly how somebody reaches the console from an invitation.',
          ].join('\n'),
        },
        operatorSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'endur.ops',
          description: [
            'The **platform operator** session, set by `POST /platform/auth/login` (password **and** a TOTP code).',
            '',
            'A separate cookie name is not tidiness. One session with two meanings is how privilege-confusion',
            'bugs happen: any code path asking "is there a session?" without asking "which kind?" becomes a',
            'vulnerability the moment the second kind exists. It is scoped to `/api/v1/platform`, so a cookie',
            'that is not sent to `/api/v1/campaigns` cannot be read by middleware that had no business seeing it.',
            '',
            'Shorter-lived than a staff session (12 hours against 7 days): it reaches every customer’s plan data,',
            'so the window worth stealing should be the smaller one.',
          ].join('\n'),
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description:
            'Double-submit: echo the readable `endur.csrf` cookie on every mutation made with a cookie session.',
        },
      },
      schemas: {
        Error: ERROR_ENVELOPE,
        // The one recursive shape, defined once so children can point back at it.
        UnitNode: defineRef(UnitNodeSchema, CTX),
      },
    },
    paths,
  };
}
