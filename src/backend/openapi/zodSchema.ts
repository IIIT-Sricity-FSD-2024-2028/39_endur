// Converts a Zod schema into an OpenAPI schema, by hand rather than with a library.
// The input is only our own DTOs, and an unknown construct THROWS rather than emitting something
// plausible - openapi.test.ts runs every mounted DTO through it, so a gap is named by CI.
import type { z } from 'zod';

// The bit of OpenAPI's schema object this file emits.
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

// Zod keeps everything on _def. This is the one place that reaches into it.
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

// The string rules worth publishing. trim and toLowerCase are left out: they change the value, they do not reject it.
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

// Named schemas, so a recursive one can point at itself. The org tree is the only such shape.
export type ConvertContext = { refs?: Map<z.ZodTypeAny, string> };

// Converts one schema. 'path' is carried only so an error can say where the problem is.
export function toJsonSchema(schema: z.ZodTypeAny, path = '', ctx?: ConvertContext): JsonSchema {
  const named = ctx?.refs?.get(schema);
  if (named) return { $ref: `#/components/schemas/${named}` };
  return convert(schema, path, ctx);
}

// The body of the conversion, split out so the $ref shortcut above runs once per schema.
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
      // z.coerce.number() accepts the string a query parameter really arrives as.
      if (def.coerce) return described({ ...out, type: [out.type as string, 'string'] });
      return described(out);
    }
    case 'ZodBoolean':
      return described(def.coerce ? { type: ['boolean', 'string'] } : { type: 'boolean' });
    case 'ZodDate':
      // Dates travel as ISO strings; z.coerce.date() is what turns one into a Date.
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
        // Optional and defaulted both mean "the caller may leave it out", so neither is marked required.
        if (!isOptionalish(value)) required.push(key);
      }
      const out: JsonSchema = { type: 'object', properties };
      if (required.length > 0) out.required = required;
      // validate() strips unknown keys instead of rejecting them, so the document says they are simply not part of the contract.
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
      // Optionality is recorded in the parent object's required list, so this only unwraps.
      return toJsonSchema(def.innerType as z.ZodTypeAny, path, ctx);
    case 'ZodNullable': {
      const inner = toJsonSchema(def.innerType as z.ZodTypeAny, path, ctx);
      // OpenAPI 3.1 writes nullable as a type union, unlike 3.0's nullable: true.
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
      // .refine() and .transform() carry rules a schema cannot express, so the shape underneath is what is described.
      return toJsonSchema(def.schema as z.ZodTypeAny, path, ctx);
    case 'ZodPipeline':
      return toJsonSchema(def.out as z.ZodTypeAny, path, ctx);
    case 'ZodCatch':
      return toJsonSchema(def.innerType as z.ZodTypeAny, path, ctx);
    case 'ZodLazy':
      // Not registered, so inline it. A genuinely recursive schema must be registered instead, or this would not terminate.
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

// Optional from the caller's point of view: .optional(), .default(), or one wrapped in the other.
function isOptionalish(schema: z.ZodTypeAny): boolean {
  const def = defOf(schema);
  if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') return true;
  if (def.typeName === 'ZodEffects') return isOptionalish(def.schema as z.ZodTypeAny);
  return false;
}

// Walks a DTO and throws on the first construct with no rule. Run by the tests over every mounted DTO.
export function assertConvertible(schema: z.ZodTypeAny, path = ''): void {
  toJsonSchema(schema, path);
}

// Emits a named schema's definition, so UnitNode lands in components.schemas while children stays a $ref.
export function defineRef(schema: z.ZodTypeAny, ctx: ConvertContext): JsonSchema {
  const def = (schema as unknown as { _def: Def })._def;
  const inner = def.typeName === 'ZodLazy' ? (def.getter as () => z.ZodTypeAny)() : schema;
  return convert(inner, '', ctx);
}

// Splits a dto({ body, query, params }) back into its three halves, since OpenAPI describes them separately.
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
