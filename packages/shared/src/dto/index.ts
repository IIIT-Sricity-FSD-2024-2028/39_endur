// Zod schemas as DTOs — the type is inferred FROM the schema, never the other way round.
// That inversion is the point: one definition, and the compiler enforces that client and
// server agree about it. Layout fixed by architecture/14 §2.
export * from './common.js';
export * from './auth.js';

// Filled as each feature lands:
//   auth.ts org.ts unit.ts role.ts grant.ts person.ts subject.ts
//   template.ts campaign.ts response.ts results.ts home.ts profile.ts
//   upload.ts authz.ts
