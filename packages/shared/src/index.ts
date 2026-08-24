// The contract package. Imported by BOTH apps — a shape defined here is defined once.
// 03 §1, DEC-003.
export * from './capabilities.js';
// 33's, not 11's: the CATALOGUE is the permission engine's, what each row SAYS is the
// powers grid's design work. See D-008.
export * from './capability-labels.js';
export * from './errors.js';
export * from './labels.js';
export * from './vocabularies.js';
export * from './tiers.js';
export * from './dto/index.js';
