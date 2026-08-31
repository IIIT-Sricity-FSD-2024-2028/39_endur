// Zod → OpenAPI 3.1 Schema Object. `DEC-115`, `13` §12.
//
// WHY THIS IS HAND-WRITTEN AND NOT `zod-to-json-schema`.
//
// Two reasons, and the first is the boring one: `package-lock.json` carries the Windows
// esbuild binary for the other machine on this project, so `npm install <anything>` fails to
// reconcile the tree on Linux and succeeds only by rewriting the lock in a way that breaks the
// other developer. A documentation feature is not worth that.
//
// The second is the one that would have mattered anyway. The input to this file is not "any
// Zod schema" — it is `packages/shared/src/dto/**`, which is a bounded, reviewed vocabulary
// this project owns. `assertConvertible()` at the bottom is asserted over EVERY DTO in the
// catalogue by `openapi.test.ts`, so the day somebody reaches for a construct this does not
// handle, a test says so by name rather than the spec quietly emitting `{}` for a field.
// A general converter would emit something plausible for the same schema and never tell
// anyone.
//
// WHAT IT REFUSES TO DO IS THE POINT. An unknown construct THROWS. A documentation generator
// that silently degrades produces a document that is confidently wrong, which is worse than no
// document — a reader cannot tell the difference between "this field takes any JSON" and "the
// generator did not understand this field".
import type { z } from 'zod';

/** OpenAPI 3.1 Schema Object, as much of one as this file emits. */
export type JsonSchema = {
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  nullable?: boolean;
  $ref?: string;
};

export class UnsupportedSchema extends Error {
  constructor(typeName: string, path: string) {
    super(`openapi: no rule for Zod type \`${typeName}\`${path ? ` at ${path}` : ''}`);
    this.name = 'UnsupportedSchema';
  }
}

/** Zod v3 keeps everything on `_def`. This is the one place that reaches in. */
type Def = {
  typeName: string;
  description?: string;
  checks?: Array<{ kind: string; value?: unknown; regex?: RegExp }>;
  coerce?: boolean;
  innerType?: z.ZodTypeAny;
  schema?: z.ZodTypeAny;
  type?: z.ZodTypeAny;
  in?: z.ZodTypeAny;
  out?: z.ZodTypeAny;
  keyType?: z.ZodTypeAny;
  valueType?: z.ZodTypeAny;
  values?: readonly string[];
  value?: unknown;
  options?: z.ZodTypeAny[] | Map<unknown, z.ZodTypeAny>;
  discriminator?: string;
  shape?: () => Record<string, z.ZodTypeAny>;
  getter?: () => z.ZodTypeAny;
  minLength?: { value: number } | null;
  maxLength?: { value: number } | null;
  defaultValue?: () => unknown;
  unknownKeys?: string;
};

const defOf = (schema: z.ZodTypeAny): Def => (schema as unknown as { _def: Def })._def;

/**
 * The string checks worth publishing, and the ones deliberately dropped.
 *
 * `trim` and `toLowerCase` are TRANSFORMS, not constraints — they describe what the server
 * does to the value after accepting it, and putting them in the schema would tell a client
 * that `" Ravi "` is invalid when it is accepted and stored as `"Ravi"`. `13` §12's rule is
 * that the document describes what the API ACCEPTS.
 */
function applyStringChecks(out: JsonSchema, checks: Def['checks']): void {
  for (const check of checks ?? []) {
    switch (check.kind) {
      case 'min': out.minLength = check.value as number; break;
      case 'max': out.maxLength = check.value as number; break;
      case 'length': out.minLength = out.maxLength = check.value as number; break;
      case 'email': out.format = 'email'; break;
      case 'uuid': out.format = 'uuid'; break;
      case 'url': out.format = 'uri'; break;
      case 'datetime': out.format = 'date-time'; break;
      case 'regex': out.pattern = (check.regex as RegExp).source; break;
      // Transforms, not constraints. See above.
      case 'trim': case 'toLowerCase': case 'toUpperCase': break;
      default: break;
    }
  }
}

function applyNumberChecks(out: JsonSchema, checks: Def['checks']): void {
  for (const check of checks ?? []) {
    switch (check.kind) {
      case 'int': out.type = 'integer'; break;
      case 'min': out.minimum = check.value as number; break;
      case 'max': out.maximum = check.value as number; break;
      default: break;
    }
  }
}

/**
 * NAMED SCHEMAS, SO A RECURSIVE ONE CAN REFER TO ITSELF.
 *
 * The org tree is the only recursive shape in the product — `UnitNode.children` is
 * `UnitNode[]` — and it is written as `z.lazy()` because TypeScript cannot infer a
 * self-referential type without help. Inlining it would not terminate.
 *
 * JSON Schema's answer is a `$ref`, which needs a NAME, which Zod does not carry. So the caller
 * supplies one: `spec.ts` registers `UnitNodeSchema` as `UnitNode`, converts it once into
 * `components.schemas`, and every later encounter — including the one inside `children` — comes
 * back as a reference instead of another copy.
 */
export type ConvertContext = { refs?: Map<z.ZodTypeAny, string> };

/**
 * Convert one schema. `path` is carried for the error message only — a generator that throws
 * `no rule for ZodTuple` without saying where is a generator somebody greps the whole DTO
 * folder for.
 */
export function toJsonSchema(schema: z.ZodTypeAny, path = '', ctx?: ConvertContext): JsonSchema {
  const named = ctx?.refs?.get(schema);
  if (named) return { $ref: `#/components/schemas/${named}` };
  return convert(schema, path, ctx);
}

/** The body of the conversion. Split out so the `$ref` short-circuit above runs exactly once
 *  per schema and `defineRef()` can bypass it to emit the definition itself. */
function convert(schema: z.ZodTypeAny, path: string, ctx?: ConvertContext): JsonSchema {
  const def = defOf(schema);
  const described = (out: JsonSchema): JsonSchema =>
    def.description ? { ...out, description: def.description } : out;

  switch (def.typeName) {
    case 'ZodString': {
      const out: JsonSchema = { type: 'string' };
      applyStringChecks(out, def.checks);
      return described(out);
    }
    case 'ZodNumber': {
      const out: JsonSchema = { type: 'number' };
      applyNumberChecks(out, def.checks);
      // `z.coerce.number()` accepts the STRING a query parameter actually arrives as. Saying
      // `type: number` alone would document a request no browser can make on a query string.
      if (def.coerce) return described({ ...out, type: [out.type as string, 'string'] });
      return described(out);
    }
    case 'ZodBoolean':
      return described(def.coerce ? { type: ['boolean', 'string'] } : { type: 'boolean' });
    case 'ZodDate':
      // ISO 8601 on the wire, always — `z.coerce.date()` is what turns it into a Date, and
      // the client never sends anything but a string.
      return described({ type: 'string', format: 'date-time' });
    case 'ZodLiteral':
      return described({ const: def.value });
    case 'ZodEnum':
      return described({ type: 'string', enum: [...(def.values ?? [])] });
    case 'ZodNativeEnum':
      return described({ type: 'string' });
    case 'ZodArray': {
      const out: JsonSchema = {
        type: 'array',
        items: toJsonSchema(def.type as z.ZodTypeAny, `${path}[]`, ctx),
      };
      if (def.minLength) out.minItems = def.minLength.value;
      if (def.maxLength) out.maxItems = def.maxLength.value;
      return described(out);
    }
    case 'ZodObject': {
      const shape = def.shape?.() ?? {};
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toJsonSchema(value, path ? `${path}.${key}` : key, ctx);
        // OPTIONAL AND DEFAULTED ARE BOTH "the caller may omit it", and only the first is
        // obvious. A field with `.default(50)` is not required of the caller — documenting it
        // as required would make every list endpoint look like it needs a `limit`.
        if (!isOptionalish(value)) required.push(key);
      }
      const out: JsonSchema = { type: 'object', properties };
      if (required.length > 0) out.required = required;
      // `validate()` STRIPS unknown keys rather than rejecting them (12 §4.9), so the honest
      // document says extra properties are not part of the contract rather than that they are
      // an error. `false` would promise a 4xx that never comes.
      out.additionalProperties = false;
      return described(out);
    }
    case 'ZodRecord':
      return described({
        type: 'object',
        additionalProperties: toJsonSchema(def.valueType as z.ZodTypeAny, `${path}{}`, ctx),
      });
    case 'ZodUnion':
      return described({
        anyOf: (def.options as z.ZodTypeAny[]).map((option, i) =>
          toJsonSchema(option, `${path}|${i}`, ctx),
        ),
      });
    case 'ZodDiscriminatedUnion': {
      const options = def.options instanceof Map ? [...def.options.values()] : (def.options ?? []);
      return described({
        oneOf: options.map((option, i) => toJsonSchema(option, `${path}|${i}`, ctx)),
        ...(def.discriminator ? { description: `Discriminated on \`${def.discriminator}\`.` } : {}),
      });
    }
    case 'ZodOptional':
      // The OPTIONALITY is recorded by the parent object's `required` list, not here — an
      // OpenAPI schema has no "optional" of its own. So this unwraps and nothing else.
      return toJsonSchema(def.innerType as z.ZodTypeAny, path, ctx);
    case 'ZodNullable': {
      const inner = toJsonSchema(def.innerType as z.ZodTypeAny, path, ctx);
      // 3.1 spells nullable as a type union, unlike 3.0's `nullable: true`.
      const type = inner.type;
      if (typeof type === 'string') return { ...inner, type: [type, 'null'] };
      if (Array.isArray(type)) return { ...inner, type: [...type, 'null'] };
      return { anyOf: [inner, { type: 'null' }] };
    }
    case 'ZodDefault': {
      const inner = toJsonSchema(def.innerType as z.ZodTypeAny, path, ctx);
      return { ...inner, default: def.defaultValue?.() };
    }
    case 'ZodEffects':
      // `.refine()` and `.transform()`. `nameField()` is the one that matters: the RULE it adds
      // ("at least one letter") is a sentence a schema cannot carry, and it is already the
      // field's own error message. The shape underneath is what the document describes.
      return toJsonSchema(def.schema as z.ZodTypeAny, path, ctx);
    case 'ZodPipeline':
      return toJsonSchema(def.out as z.ZodTypeAny, path, ctx);
    case 'ZodCatch':
      return toJsonSchema(def.innerType as z.ZodTypeAny, path, ctx);
    case 'ZodLazy':
      // Unregistered: inline it. That is right for a lazy schema used only to defer evaluation,
      // and it does not terminate for a genuinely recursive one — which is exactly why
      // `spec.ts` registers the one recursive schema in the product rather than hoping.
      return toJsonSchema((def.getter as () => z.ZodTypeAny)(), path, ctx);
    case 'ZodAny':
    case 'ZodUnknown':
      return described({});
    case 'ZodNull':
      return described({ type: 'null' });
    default:
      throw new UnsupportedSchema(def.typeName, path);
  }
}

/** Optional to the CALLER: `.optional()`, `.default()`, or either wrapped in the other. */
function isOptionalish(schema: z.ZodTypeAny): boolean {
  const def = defOf(schema);
  if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') return true;
  if (def.typeName === 'ZodEffects') return isOptionalish(def.schema as z.ZodTypeAny);
  return false;
}

/**
 * Walk a DTO and throw on the first construct with no rule. Called by `openapi.test.ts` over
 * every DTO the app actually mounts, which is what turns "this converter is incomplete" from
 * something a reader notices into something CI says.
 */
export function assertConvertible(schema: z.ZodTypeAny, path = ''): void {
  toJsonSchema(schema, path);
}

/**
 * Emit a named schema's DEFINITION, bypassing the `$ref` short-circuit that every other
 * reference to it takes. This is what puts `UnitNode` into `components.schemas` while
 * `children` inside it still comes out as `{ $ref: '#/components/schemas/UnitNode' }`.
 */
export function defineRef(schema: z.ZodTypeAny, ctx: ConvertContext): JsonSchema {
  const def = (schema as unknown as { _def: Def })._def;
  const inner = def.typeName === 'ZodLazy' ? (def.getter as () => z.ZodTypeAny)() : schema;
  return convert(inner, '', ctx);
}

/**
 * Split a `dto({ body, query, params })` composite into its three halves.
 *
 * The composite exists because `validate()` parses one thing (`14` §3); OpenAPI wants the body
 * and the parameters described separately. This is the one place that knows the composite's
 * shape, so the DTO helper and the document cannot disagree about what a request is.
 *
 * An EMPTY object comes back as `undefined` rather than as `{}` — `dto()` fills the missing
 * halves with `z.object({}).optional()`, and publishing those would put an empty request body
 * on every GET in the product.
 */
export function splitDto(schema: z.ZodTypeAny): {
  body?: JsonSchema;
  query?: JsonSchema;
  params?: JsonSchema;
} {
  const def = defOf(schema);
  if (def.typeName !== 'ZodObject') return {};
  const shape = def.shape?.() ?? {};
  const part = (key: 'body' | 'query' | 'params'): JsonSchema | undefined => {
    const member = shape[key];
    if (!member) return undefined;
    const json = toJsonSchema(member, key);
    const empty =
      json.type === 'object' && Object.keys(json.properties ?? {}).length === 0 && !json.$ref;
    return empty ? undefined : json;
  };
  return {
    ...(part('body') ? { body: part('body') as JsonSchema } : {}),
    ...(part('query') ? { query: part('query') as JsonSchema } : {}),
    ...(part('params') ? { params: part('params') as JsonSchema } : {}),
  };
}
