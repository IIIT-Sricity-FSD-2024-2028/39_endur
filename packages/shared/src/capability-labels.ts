// What a capability SAYS to somebody who is not a programmer. 33 § Interactions, repaying
// `D-008`.
//
// WHY THIS IS A TABLE AND NOT A DERIVATION. It used to be four lines in
// `features/roles/service.ts`:
//
//   const [object, verb] = capability.split('.');
//   return `${verb} ${object}s`.replace(/ss$/, 'ses');
//
// which is how `campaign.launch` became *"launch campaigns"* — a domain noun, hardcoded,
// on the one grid a hotel administrator reads (INV-001). `audit:vocab` cannot see it,
// because the string is assembled from a key rather than written down anywhere, and that is
// exactly why `D-008` was filed instead of fixed: **deciding what each row says is design
// work**, and `33` is the document that owns it.
//
// Writing them out also surfaced that the derivation was not merely un-localised, it was
// wrong. `results.read` produced *"read resultses"*. `apikey.create` produced
// *"create apikeys"*. `actionplan.read`, *"read actionplans"*. Nobody had read the output
// for the objects added after the rule was written, which is the failure mode of every
// clever string derivation.
//
// THREE OBJECTS ARE THE ORGANISATION'S WORDS AND TWENTY ARE OURS. `unit`, `subject` and
// `campaign` are what `organization.labels` renames (22 §2), so they arrive as `{unit}`,
// `{subject}` and `{campaign}` and are filled per tenant. Everything else — roles, powers,
// people, templates, accounts — is Endur's own furniture and correctly stays literal, which
// is INV-001's own carve-out and not an exception to it.
import type { ResolvedLabels } from './labels.js';
import { CAPABILITY_CATALOGUE, type Capability } from './capabilities.js';

/**
 * One phrase per capability, completing the sentence *"Nobody in this organisation can …"*
 * and *"This role can …"*. Both readers matter: the grid's row header and the warning text
 * are the same string, so a phrase that only works as a heading would break the other.
 *
 * `{unit}` `{subject}` `{campaign}` are filled from the tenant's vocabulary, always in the
 * PLURAL — a row label is about the class of thing, never one of them.
 */
const PHRASES: Record<Capability, string> = {
  'org.read': 'view the organisation',
  'org.update': 'edit the organisation — its name, its industry and its words',
  'org.delete': 'delete the entire organisation',

  'unit.read': 'view {unit}',
  'unit.create': 'add {unit}',
  'unit.update': 'rename {unit}',
  'unit.delete': 'delete {unit}',
  'unit.reparent': 'move {unit} to a different parent',

  'role.read': 'view the list of roles',
  'role.create': 'add a role',
  'role.update': 'rename and reorder roles',
  'role.delete': 'delete a role',

  'grant.read': 'view the powers grid',
  'grant.update': 'change what every role is allowed to do',

  'person.read': 'view people',
  'person.create': 'add a person',
  'person.update': 'edit a person’s name and email',
  'person.delete': 'remove a person',
  'person.import': 'import people from a spreadsheet',

  'assignment.create': 'give somebody a position',
  'assignment.delete': 'take a position away',

  'account.create': 'give somebody a sign-in',
  'account.reset': 'send somebody a new sign-in link',
  'account.revoke': 'end somebody’s access',

  'group.read': 'view groups',
  'group.create': 'create a group',
  'group.update': 'change who is in a group',
  'group.delete': 'delete a group',

  'delegation.read': 'view stand-in arrangements',
  'delegation.create': 'hand duties to a stand-in',
  'delegation.revoke': 'end a stand-in arrangement',

  'subject.read': 'view {subject}',
  'subject.create': 'add {subject}',
  'subject.update': 'edit {subject}',
  'subject.archive': 'archive {subject}',

  'template.read': 'view the template library',
  'template.create': 'create a template',
  'template.update': 'edit a template',
  'template.delete': 'delete a template',
  'template.clone': 'copy a template to build from',

  'campaign.read': 'view {campaign}',
  'campaign.create': 'set up {campaign}',
  'campaign.update': 'edit {campaign} before they open',
  'campaign.delete': 'delete {campaign}',
  'campaign.launch': 'open {campaign} for answers',
  'campaign.close': 'close {campaign} to further answers',

  'response.read': 'read individual answers',
  'response.export': 'export answers to a file',

  'results.read': 'view results and summaries',
  'results.export': 'export results to a file',

  'simulator.run': 'test what somebody else can see',
  'audit.read': 'read the activity log',

  'apikey.read': 'view API keys',
  'apikey.create': 'issue an API key',
  'apikey.revoke': 'revoke an API key',

  'billing.read': 'see which plan this organisation is on',
  'billing.update': 'change the plan',

  'reflection.create': 'write a self-reflection',
  'reflection.read': 'read self-reflections',
  'actionplan.create': 'write an action plan',
  'actionplan.read': 'read action plans',
  'checkin.create': 'record a check-in on a plan',
  'checkin.read': 'read check-ins',

  'analysis.read': 'view themes and analysis',

  // T-094. "Everyone" and not "{unit}", because an announcement's audience is the SAME
  // AudienceRule a campaign uses and can be the whole organisation — naming one shape of it
  // in the row label would describe the narrow case and mislead about the wide one.
  'announcement.read': 'read announcements sent to them',
  'announcement.create': 'write an announcement',
  'announcement.publish': 'send an announcement to everyone it is addressed to',
  'announcement.delete': 'delete an announcement',

  // T-095. "Somebody else's" is doing the work in the last row: it is the whole reason
  // `booking.cancel` is a separate verb, and a grid row that read "cancel a booking" would
  // let an administrator hand it out thinking it meant their own.
  'booking.read': 'see bookable things, their slots and who has booked',
  'booking.create': 'create something people can book',
  'booking.update': 'edit a bookable thing, its slots and its link',
  'booking.delete': 'delete a bookable thing',
  'booking.cancel': "cancel somebody else's booking",
};

/**
 * The phrase for one capability, in this organisation's words.
 *
 * Falls back to the raw key rather than to a derivation. A capability with no phrase is a
 * catalogue entry somebody added without visiting `33`, and showing `widget.frobnicate`
 * makes that obvious in one glance — where *"frobnicate widgets"* would look deliberate and
 * ship. `capabilityLabels.test.ts` fails the build before either can happen.
 */
export function describeCapability(capability: string, labels: ResolvedLabels): string {
  const phrase = PHRASES[capability as Capability];
  if (phrase === undefined) return capability;
  return phrase
    .replace('{unit}', labels.unit.many.toLowerCase())
    .replace('{subject}', labels.subject.many.toLowerCase())
    .replace('{campaign}', labels.campaign.many.toLowerCase());
}

/** Every catalogue key, so a test can assert the two lists are the same list. */
export const CAPABILITIES_WITH_PHRASES = Object.keys(PHRASES) as Capability[];

/** Guards the other direction: a phrase for a capability that no longer exists. */
export const capabilityHasPhrase = (capability: string): boolean =>
  capability in PHRASES && capability in CAPABILITY_CATALOGUE;
