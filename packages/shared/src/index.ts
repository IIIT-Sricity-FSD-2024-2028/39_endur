// The contract package. Imported by BOTH apps — a shape defined here is defined once.
// 03 §1, DEC-003.
export * from './capabilities.js';
// 33's, not 11's: the CATALOGUE is the permission engine's, what each row SAYS is the
// powers grid's design work. See D-008.
export * from './capability-labels.js';
// 19 §4. A SECOND, SEPARATE catalogue, and the separation is load-bearing: these strings
// must never reach TIER_ENTITLEMENTS or the powers grid. Exported beside the org one so
// that the two being different is visible here, at the package's front door.
export * from './platform-capabilities.js';
// `71`'s decision 4 — one predicate, imported by both the estate row chip and the backend
// analytics count, so "quiet" cannot drift between the two screens that show it.
export * from './platform-quiet.js';
export * from './errors.js';
export * from './labels.js';
export * from './vocabularies.js';
export * from './tiers.js';
export * from './dto/index.js';
