// Zod schemas as DTOs — the type is inferred FROM the schema, never the other way round.
// That inversion is the point: one definition, and the compiler enforces that client and
// server agree about it. Layout fixed by architecture/14 §2.
export * from './common.js';
export * from './auth.js';
<<<<<<< HEAD

// Filled as each feature lands:
//   auth.ts org.ts unit.ts role.ts grant.ts person.ts subject.ts
//   template.ts campaign.ts response.ts results.ts home.ts profile.ts
//   upload.ts authz.ts
=======
export * from './org.js';
export * from './template.js';
export * from './unit.js';
export * from './role.js';
export * from './grant.js';
export * from './person.js';
export * from './subject.js';
export * from './campaign.js';
export * from './response.js';
export * from './results.js';
export * from './home.js';

// Filled as each feature lands:
//   unit.ts role.ts grant.ts person.ts subject.ts
//   campaign.ts response.ts results.ts home.ts profile.ts upload.ts authz.ts
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
