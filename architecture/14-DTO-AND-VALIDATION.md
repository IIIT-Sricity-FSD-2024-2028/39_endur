# 14 — DTOs and validation

Phase: P1 · Milestone: M0 · Owns: `packages/shared/src/dto/**`
Decisions: `_MEMORY.md` DEC-001, DEC-003

---

## 1. What a DTO is here

In NestJS a DTO is a class with decorators. We are on Express (DEC-001), so:

> **A DTO is a Zod schema in `packages/shared`, and its TypeScript type is inferred from it.**

That inversion — type from schema, not schema from type — is the point. A hand-written
`interface` plus a separate validator is two sources of truth that drift silently. With
`z.infer` there is exactly one definition, and the compiler enforces that the client and the
server agree about it.

```ts
// packages/shared/src/dto/campaign.ts
import { z } from 'zod';

export const CreateCampaignBody = z.object({
  name:        z.string().min(1).max(120),
  templateId:  z.string().uuid(),
  subjectIds:  z.array(z.string().uuid()).min(1),
  audience:    AudienceRule,
  startsAt:    z.coerce.date().optional(),
  endsAt:      z.coerce.date().optional(),
  anonymous:   z.boolean().default(true),
}).refine(v => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt,
          { message: 'End must be after start', path: ['endsAt'] });

export type CreateCampaignBody = z.infer<typeof CreateCampaignBody>;
```

Schema and type share a name deliberately — TypeScript keeps values and types in separate
namespaces, so `import { CreateCampaignBody }` gives you whichever you need at that position.

## 2. Layout

```
packages/shared/src/dto/
  common.ts       Id, Cursor, Pagination, LabelSet, primitives reused everywhere
  auth.ts         Register, Login, Me            (no Refresh — DEC-014)
  org.ts          UpdateOrg, UpdateLabels, SetupOrg
  unit.ts         CreateUnit, UpdateUnit, Reparent
  role.ts         CreateRole, ReorderRoles
  grant.ts        GrantCell, PutGrantsMatrix
  person.ts       CreatePerson, UpdatePerson, CreateAssignment, ImportPeople
  subject.ts      CreateSubject, UpdateSubject
  template.ts     CreateTemplate, PutQuestions, QuestionConfig  ← §4
  campaign.ts     CreateCampaign, LaunchCampaign, AudienceRule
  response.ts     SubmitResponse, AnswerValue                   ← §4
  results.ts      ResultsView, QuestionSummary
  home.ts         HomeView                                   (46)
  profile.ts      ProfileView, UpdateProfile, ChangePassword  (47)
  upload.ts       UploadResult                                (48)
  authz.ts        SimulateRequest, Decision
  index.ts
```

Rule of thumb: **request DTOs are strict, response DTOs are documentation.** Requests are
parsed and enforced. Responses are typed so the client knows the shape, but the server does
not re-validate its own output on the hot path — that is cost with no benefit. The exception
is the public respondent payload, which *is* validated on the way out, because §6 of
`13-API-CONTRACT.md` makes leaking a security matter rather than a bug.

## 3. Route composition

`validate()` takes body, query and params together, so one schema describes a whole request
(`12` §4.8).

```ts
export const dto = <B, Q, P>(parts: {
  body?: z.ZodType<B>; query?: z.ZodType<Q>; params?: z.ZodType<P>;
}) => z.object({
  body:   parts.body   ?? z.object({}).optional(),
  query:  parts.query  ?? z.object({}).optional(),
  params: parts.params ?? z.object({}).optional(),
});

export const LaunchCampaignDto = dto({
  params: z.object({ id: z.string().uuid() }),
  body:   z.object({ notifyNow: z.boolean().default(false) }),
});
```

In the handler:

```ts
const launchCampaign: Handler<typeof LaunchCampaignDto> = async (req, res) => {
  const { params, body } = req.data;   // fully typed, coerced, stripped
  ...
};
```

**Handlers read `req.data`, never `req.body`.** A handler touching `req.body` is reading
unvalidated input, and `grep -rn 'req\.body' apps/api/src/features` returning anything is a
finding. This is enforced by an ESLint `no-restricted-syntax` rule.

## 4. Discriminated unions — where this pays off most

The six question kinds are frozen (DEC-010) and each has a different `config` shape. A
discriminated union turns `config` from an untyped JSONB bag into something the compiler and
the validator both understand.

```ts
export const QuestionConfig = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rating'),
             max: z.union([z.literal(5), z.literal(10)]),
             lowLabel: z.string().max(40), highLabel: z.string().max(40) }),
  z.object({ kind: z.literal('single'),
             options: z.array(z.string().min(1)).min(2).max(10),
             allowOther: z.boolean().default(false) }),
  z.object({ kind: z.literal('multi'),
             options: z.array(z.string().min(1)).min(2).max(10),
             maxSelections: z.number().int().positive().optional() }),
  z.object({ kind: z.literal('text'),
             multiline: z.boolean().default(false),
             placeholder: z.string().max(80).optional() }),
  z.object({ kind: z.literal('yesno') }),
  z.object({ kind: z.literal('nps') }),          // fixed 0-10, fixed anchors
]);
```

Answers mirror it, which is how "answer type matches question kind" (`10` §10) becomes a type
error rather than a runtime surprise:

```ts
export const AnswerValue = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rating'), n: z.number().int().min(1).max(10) }),
  z.object({ kind: z.literal('single'), option: z.string() }),
  z.object({ kind: z.literal('multi'),  options: z.array(z.string()) }),
  z.object({ kind: z.literal('text'),   text: z.string().max(2000) }),
  z.object({ kind: z.literal('yesno'),  yes: z.boolean() }),
  z.object({ kind: z.literal('nps'),    n: z.number().int().min(0).max(10) }),
]);
```

Cross-checking an answer against *its own question* (does `option` exist in that question's
option list? is `n` within that question's `max`?) is **service-layer** work — the schema
cannot see the question row. `SubmitResponse` is validated structurally by `validate()`, then
semantically by `validateAnswersAgainstTemplate()` before any write. Both failures produce
the same 422 shape so the respondent UI renders them identically.

Adding a seventh kind means touching both unions and every editor and input — which is
exactly the friction DEC-010 intends.

## 5. Environment as a DTO

`process.env` is untrusted input like any other, so it gets the same treatment:

```ts
// apps/api/src/lib/config.ts
const Env = z.object({
  NODE_ENV:        z.enum(['development', 'test', 'production']),
  PORT:            z.coerce.number().default(4000),
  DATABASE_URL:    z.string().url(),
  SESSION_SECRET:  z.string().min(32),
  PUBLIC_BASE_URL: z.string().url(),
  K_ANON_THRESHOLD: z.coerce.number().int().min(1).default(5),
});

export const config = Env.parse(process.env);   // throws at boot, not at 3am
```

A missing `SESSION_SECRET` should kill the process on startup, not surface as a confusing 500
during the demo.

## 6. Error mapping

`ValidationError` wraps the `ZodError`; `errorFunnel` flattens it into the envelope
(`13` §5).

```ts
const fields = zodError.issues.map(i => ({
  path: i.path.join('.'),                 // "body.questions.0.text"
  message: humanise(i),
}));
```

`humanise()` exists because Zod's default messages are developer-facing. `"String must
contain at least 1 character(s)"` is not what a respondent should read; `"Question text is
required"` is. Rules from `design_specs/design/10` §4: say what is wrong and what to do, in
sentence case, no exclamation marks, never blame the user.

The `path` uses dots and array indices so the React form can address the exact field —
`questions.0.text` maps to the first question card's text input, which is what makes inline
errors land in the right place rather than at the top of the page.

## 7. Client use

The same schema types the client (DEC-003):

```ts
// apps/web/src/lib/api.ts
export async function createCampaign(input: CreateCampaignBody): Promise<Campaign> {
  return post('/api/v1/campaigns', input);
}
```

The client may also `.parse()` before sending, to render validation inline without a round
trip. **This is a convenience, never the enforcement** — the server always re-validates,
because the client is not trustworthy (INV-003 applies to input as well as authorisation).

## 8. Conventions

| Rule | Reason |
|---|---|
| `.strict()` is **not** used; unknown keys are stripped | Forward compatibility, and stripping is what blocks `orgId` smuggling |
| No `orgId` in any request DTO | It comes from `tenantResolver` (INV-010). Accepting it is an attack surface |
| No `role`, `level`, or `capability` in a create-person DTO | Assignments are a separate, audited call |
| `z.coerce.date()` for timestamps | Query strings are strings |
| Every string has a `.max()` | An unbounded string is an unbounded row |
| Enums come from shared consts, never inline literals in two places | One rename, one place |
| Response DTOs carry an explicit `valence` on anything charted | CONF-004 — the client must never infer good/bad from a sign |

## 9. Acceptance

- [ ] Every route in `13-API-CONTRACT.md` has a DTO in `packages/shared/src/dto`
- [ ] `grep -rn 'req\.body' apps/api/src/features` returns nothing
- [ ] No request DTO accepts `orgId`
- [ ] `QuestionConfig` and `AnswerValue` are discriminated unions over the same six kinds
- [ ] Submitting an answer whose kind mismatches its question returns 422, not 500
- [ ] Submitting `option: "X"` where X is not in the question's options returns 422 with a
      field path
- [ ] The API boots with a clear message when a required env var is missing
- [ ] A 422 body's `path` values address real form fields — verified by the builder rendering
      an error inline from a fixture

## 10. Out of scope

| Not doing | Why |
|---|---|
| class-validator / class-transformer | Decorator idiom without the framework that makes it coherent (DEC-001) |
| OpenAPI generation from Zod | Real value at P3 with the public API (`45`). Premature now |
| Runtime validation of responses on the hot path | Cost without benefit — except the public respondent payload, §2 |
| A shared validation package separate from DTOs | One package. Two would create an import-order question nobody needs |
