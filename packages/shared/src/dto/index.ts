// Zod schemas as DTOs — the type is inferred FROM the schema, never the other way round.
// That inversion is the point: one definition, and the compiler enforces that client and
// server agree about it. Layout fixed by architecture/14 §2.
export * from './common.js';
export * from './auth.js';
export * from './org.js';
export * from './template.js';
export * from './unit.js';
export * from './role.js';
export * from './grant.js';
export * from './person.js';
export * from './profile.js';
export * from './account.js';
export * from './subject.js';
export * from './campaign.js';
export * from './response.js';
export * from './results.js';
export * from './home.js';
export * from './inbox.js';
export * from './analysis.js';
export * from './improve.js';

// Filled as each feature lands:
//   unit.ts role.ts grant.ts person.ts subject.ts
//   campaign.ts response.ts results.ts home.ts upload.ts authz.ts
