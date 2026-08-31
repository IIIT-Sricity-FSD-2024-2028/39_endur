// T-110 — the API document. `DEC-115`, `13` §12.
//
// FOUR TESTS, AND THE FIRST TWO ARE WHY THE DOCUMENT CAN BE TRUSTED.
//
// Generated documentation is only worth more than hand-written documentation if it cannot fall
// behind. `routes.test.ts` already makes a route without a guard a build failure; these make a
// route without a documented response, and a DTO the converter cannot express, build failures
// too. Between the three, the ways a route can exist without being correctly described are
// closed.
//
// The fourth is the one no type system could do: it parses REAL RESPONSES from the running app
// through the schemas the document publishes. `mirrors<T>()` in `components.ts` proves the
// schema matches the TYPE; this proves the handler matches the schema.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import { app, setUpOrg, type Session } from './helpers.js';
import { createApp } from '../app.js';
import { enumerateRoutes, openApiPath, routeKey } from '../lib/routeTable.js';
import { assertConvertible } from '../openapi/zodSchema.js';
import { buildOpenApiDocument } from '../openapi/spec.js';
import { RESPONSES } from '../openapi/responses.js';
import {
  BillingSummarySchema,
  HomeViewSchema,
  MeResponseSchema,
  OrgViewSchema,
  PersonSummarySchema,
  ProfileViewSchema,
  RoleViewSchema,
  SubjectSummarySchema,
  TemplateSummarySchema,
  UnitNodeSchema,
} from '../openapi/components.js';

const routes = enumerateRoutes(createApp());

describe('the document describes every route, and only real ones', () => {
  it('every mounted route has a documented response', () => {
    // THE TEST THAT KEEPS IT HONEST. Add a route and this names it — which is the difference
    // between a document that is generated and a document that is merely generated ONCE.
    const undocumented = routes.map(routeKey).filter((key) => !RESPONSES[key]);
    expect(
      undocumented,
      'add an entry to openapi/responses.ts for each of these',
    ).toEqual([]);
  });

  it('every documented response belongs to a route that exists', () => {
    // The other direction, and it is the half that rots silently: a route deleted or renamed
    // leaves an entry describing something nobody can call.
    const live = new Set(routes.map(routeKey));
    const orphans = Object.keys(RESPONSES).filter((key) => !live.has(key));
    expect(orphans, 'these entries in openapi/responses.ts describe no route').toEqual([]);
  });
});

describe('every DTO can be published', () => {
  it('the converter has a rule for every construct the app actually mounts', () => {
    // `zodSchema.ts` THROWS on a construct it does not understand rather than emitting `{}`,
    // precisely so this test can exist. A general-purpose converter would emit something
    // plausible for an unknown schema and nobody would ever find out.
    const failures: string[] = [];
    for (const route of routes) {
      if (!route.dto) continue;
      try {
        assertConvertible(route.dto, routeKey(route));
      } catch (error) {
        failures.push((error as Error).message);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('the document itself', () => {
  const doc = buildOpenApiDocument(createApp()) as {
    openapi: string;
    paths: Record<string, Record<string, Record<string, unknown>>>;
    components: { securitySchemes: Record<string, unknown> };
  };

  it('is OpenAPI 3.1 and covers every route', () => {
    expect(doc.openapi).toBe('3.1.0');
    // UNIQUE KEYS, not raw counts. `mount()`'s registry is module-level and a test process
    // builds several apps out of the same singleton routers, so the walker can legitimately
    // report one route more than once. What must hold is that the SET matches.
    const operations = new Set(
      Object.entries(doc.paths).flatMap(([url, methods]) =>
        Object.keys(methods).map((method) => `${method.toUpperCase()} ${url}`),
      ),
    );
    const expected = new Set(routes.map((route) => `${route.method} ${openApiPath(route.path)}`));
    expect([...expected].filter((key) => !operations.has(key))).toEqual([]);
    expect(operations.size).toBe(expected.size);
  });

  it('names the capability AND the roles that hold it, on every guarded route', () => {
    // The requirement this whole feature exists for: a reader must be able to see, per endpoint,
    // what they need in order to call it. The capability comes from the guard and the roles from
    // the seeded matrix — neither is retyped here or in the document.
    const people = doc.paths['/api/v1/people/']?.get as {
      description: string;
      'x-capability': string[];
    };
    expect(people['x-capability']).toEqual(['person.read']);
    expect(people.description).toContain('`person.read`');
    expect(people.description).toContain('Seeded to:');
    expect(people.description).toContain('L1');
  });

  it('says which header a mutation needs, and only where it needs one', () => {
    const create = doc.paths['/api/v1/people/']?.post as { parameters: Array<{ name: string }> };
    expect(create.parameters.map((p) => p.name)).toContain('X-CSRF-Token');

    // A GET carries no CSRF token — the middleware exempts safe methods, and a document that
    // demanded one would be describing a request nobody makes.
    const list = doc.paths['/api/v1/people/']?.get as { parameters: Array<{ name: string }> };
    expect(list.parameters.map((p) => p.name)).not.toContain('X-CSRF-Token');

    // The respondent surface has no ambient authority to protect, so no token (DEC-009).
    const submit = doc.paths['/api/v1/public/campaigns/{token}/responses']?.post as {
      parameters: Array<{ name: string }>;
    };
    expect(submit.parameters.map((p) => p.name)).not.toContain('X-CSRF-Token');
  });

  it('publishes the request body schema, derived from the DTO the server parses', () => {
    const create = doc.paths['/api/v1/people/']?.post as {
      requestBody: { content: { 'application/json': { schema: Record<string, unknown> } } };
    };
    const schema = create.requestBody.content['application/json'].schema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties).sort()).toEqual(['email', 'name']);
    expect(schema.required.sort()).toEqual(['email', 'name']);
    // `14` §8: no create-person DTO accepts a role, a level or a capability. The document says
    // so because the DTO says so — there is no second list to keep in step.
    expect(Object.keys(schema.properties)).not.toContain('roleId');
  });

  it('describes path and query parameters separately from the body', () => {
    const detail = doc.paths['/api/v1/people/{id}']?.get as {
      parameters: Array<{ name: string; in: string; required: boolean }>;
    };
    const idParam = detail.parameters.find((p) => p.in === 'path');
    expect(idParam?.name).toBe('id');
    expect(idParam?.required).toBe(true);

    const list = doc.paths['/api/v1/people/']?.get as {
      parameters: Array<{ name: string; in: string; required: boolean }>;
    };
    const limit = list.parameters.find((p) => p.name === 'limit');
    // `.default(50)` means the CALLER may omit it — documenting it as required would put a
    // mandatory `limit` on every list endpoint in the product.
    expect(limit?.in).toBe('query');
    expect(limit?.required).toBe(false);
  });

  it('documents the 404-that-means-403, which is the rule a reader would never guess', () => {
    const detail = doc.paths['/api/v1/people/{id}']?.get as {
      responses: Record<string, { description: string }>;
    };
    expect(detail.responses['404']?.description).toContain('may not SEE');
    expect(detail.responses['403']?.description).toContain('decidedBy');
  });

  it('separates the two cookie worlds', () => {
    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual([
      'csrfToken',
      'operatorSession',
      'staffSession',
    ]);
    const platform = doc.paths['/api/v1/platform/orgs']?.get as {
      security: Array<Record<string, unknown>>;
      'x-platform-capability': string[];
    };
    expect(platform.security).toEqual([{ operatorSession: [] }]);
    expect(platform['x-platform-capability']).toEqual(['platform.org.read']);
  });
});

/**
 * THE ROUND TRIP. A generated document can still be wrong in the one way generation cannot
 * catch: a handler that does not return what its type claims.
 *
 * `.strict()` is the point of this suite. `mirrors<T>()` proves a schema has no MISSING field;
 * only parsing a real body proves it has no EXTRA one — and an undocumented field is exactly the
 * kind of thing that accumulates quietly until a document is no longer worth reading.
 */
describe('the published schemas parse what the server actually sends', () => {
  let org: Session;

  beforeAll(async () => {
    org = await setUpOrg();
  });

  const strict = <T extends z.ZodTypeAny>(schema: T, body: unknown): void => {
    const result = (schema as unknown as { strict?: () => z.ZodTypeAny }).strict?.().safeParse(body)
      ?? schema.safeParse(body);
    if (!result.success) {
      throw new Error(
        `the documented schema does not match the real response:\n${JSON.stringify(
          result.error.issues,
          null,
          2,
        )}`,
      );
    }
  };

  it('GET /auth/me', async () => {
    const res = await org.agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    strict(MeResponseSchema, res.body);
  });

  it('GET /org', async () => {
    const res = await org.agent.get('/api/v1/org');
    strict(OrgViewSchema, res.body.data);
  });

  it('GET /profile', async () => {
    const res = await org.agent.get('/api/v1/profile');
    strict(ProfileViewSchema, res.body.data);
  });

  it('GET /units — the nested tree', async () => {
    const res = await org.agent.get('/api/v1/units');
    for (const node of res.body.data) strict(UnitNodeSchema, node);
  });

  it('GET /roles', async () => {
    const res = await org.agent.get('/api/v1/roles');
    for (const role of res.body.data) strict(RoleViewSchema, role);
  });

  it('GET /people — the paginated envelope', async () => {
    const res = await org.agent.get('/api/v1/people');
    expect(res.body.page).toBeDefined();
    expect(res.body.meta.total).toBeTypeOf('number');
    for (const person of res.body.data) strict(PersonSummarySchema, person);
  });

  it('GET /subjects', async () => {
    const res = await org.agent.get('/api/v1/subjects');
    for (const subject of res.body.data) strict(SubjectSummarySchema, subject);
  });

  it('GET /templates', async () => {
    const res = await org.agent.get('/api/v1/templates');
    for (const template of res.body.data) strict(TemplateSummarySchema, template);
  });

  it('GET /home', async () => {
    const res = await org.agent.get('/api/v1/home');
    strict(HomeViewSchema, res.body.data);
  });

  it('GET /billing', async () => {
    const res = await org.agent.get('/api/v1/billing');
    strict(BillingSummarySchema, res.body.data);
  });

  it('the document is served, and the viewer with it', async () => {
    const spec = await request(app).get('/api/v1/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');

    const page = await request(app).get('/api/v1/docs');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger');
  });
});
