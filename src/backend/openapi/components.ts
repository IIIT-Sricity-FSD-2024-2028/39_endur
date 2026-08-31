// RESPONSE SCHEMAS. `DEC-115`, `13` §12.
//
// The request half of the document needs no file like this: `validate()` already parses every
// request against a Zod DTO, so `openapi/spec.ts` reads the schema the server actually enforces
// and cannot describe a different one. Responses have no such schema — `13` states them as
// TypeScript types, which exist only at compile time and cannot be walked at runtime.
//
// So they are written here, once, as Zod. Two mechanisms stop them from becoming fiction, and
// neither is discipline:
//
//   1 · `mirrors<T>()` IS A COMPILE-TIME CHECK. Each schema is passed through it with the
//       shared TypeScript type as the parameter, so a schema whose inferred output is missing a
//       field, or has one at the wrong type, FAILS `tsc`. Rename a field in `PersonSummary` and
//       the build breaks here — which is the whole reason to write these in Zod rather than as
//       hand-typed JSON Schema literals, which nothing could check.
//
//   2 · `openapi.test.ts` PARSES REAL RESPONSES THROUGH THEM. `mirrors<T>()` cannot catch an
//       EXTRA field (an object with more properties is still assignable), and it cannot catch a
//       handler that returns something other than what its type claims. A live round trip
//       through `.strict()` catches both.
//
// Between them: the document cannot describe a field the type does not have, and cannot omit
// one the server actually sends.
import { z } from 'zod';
import {
  AnswerValue,
  AudienceRule,
  AuditOutcome,
  BillingStatus,
  CampaignAccess,
  CampaignStatus,
  CAPABILITIES,
  Industry,
  ImportRow,
  PlanItem,
  QuestionConfig,
  QuestionKind,
  REFLECT_STATES,
  SCOPES,
  StatWindows,
  PLATFORM_CAPABILITIES,
  TIERS,
  Valence,
  type Capability,
  type PlatformCapability,
} from '@endur/shared';
import type {
  AccountInvite,
  AccountStatus,
  ActivationPreview,
  AnalysisView,
  AnnouncementPreview,
  AnnouncementSummary,
  AudiencePreview,
  AuditEntry,
  BillingSummary,
  BookableSummary,
  BookingReceipt,
  BookingSummary,
  CampaignDetail,
  CampaignSummary,
  CapabilityMeta,
  EnterpriseRequestRow,
  EnterpriseRequestState,
  EnterSupportResponse,
  GapView,
  GrantWarning,
  HomeView,
  ImportPreview,
  InboxMessage,
  InboxResponse,
  LaunchResult,
  LogFileMeta,
  LogLine,
  LogStoreMeta,
  MeResponse,
  OrgView,
  PaymentRecord,
  PersonDetail,
  PersonSummary,
  PlatformAnalytics,
  PlatformAuditEntry,
  PlatformEarnings,
  PlatformMeResponse,
  PlatformOperator,
  PlatformOrgDetail,
  PlatformOrgSummary,
  PlatformStats,
  Position,
  PowersAtPlace,
  PresetView,
  ProfileView,
  PublicBookable,
  PublicCampaign,
  QuestionSummary,
  ReflectionCycle,
  ReflectionForm,
  ResponseItem,
  ResultsView,
  RoleView,
  SubjectDetail,
  SubjectSummary,
  SupportSessionRow,
  TemplateDetail,
  TemplateSummary,
  ThemeDetail,
  ThemeSummary,
  UnitComposition,
  UnitImpact,
  UnitNode,
  UnitTreeTotals,
} from '@endur/shared';

/**
 * The compile-time half. `z.ZodType<T>` is satisfied only by a schema whose OUTPUT is
 * assignable to `T`, so a missing or mistyped field is a type error at the call site rather
 * than a wrong line in a published document.
 *
 * It deliberately does not catch an EXTRA field — an object type with more properties is
 * assignable to one with fewer, and there is no way to say "exactly these" that survives
 * `exactOptionalPropertyTypes` without a tangle of conditional types that would fail on
 * optionals for reasons unrelated to correctness. The live round trip catches extras instead,
 * which also catches the case a type system never could: a handler that does not return what
 * its own type says.
 */
const mirrors =
  <T>() =>
  <S extends z.ZodType<Mirrorable<T>, z.ZodTypeDef, unknown>>(schema: S): S =>
    schema;

/**
 * THE ONE CONCESSION, AND IT IS TO `exactOptionalPropertyTypes` RATHER THAN TO CORRECTNESS.
 *
 * `03`'s tsconfig turns that flag on, so `rows?: GapRow[]` means *"absent, or an array"* and
 * refuses `undefined` as a VALUE. Zod cannot express that distinction: `.optional()` always
 * infers `rows?: GapRow[] | undefined`. Without this the three schemas with optional fields
 * would each need a cast, and a cast turns the compile-time check off for the whole schema —
 * losing the guarantee on twenty correct fields to accommodate one.
 *
 * So the widening is surgical. A key is relaxed **only when `undefined` is already part of its
 * declared type** — which is exactly the optional ones, plus the handful typed `unknown` (Zod
 * reports those optional too, for the same reason: `undefined extends unknown`). Every REQUIRED
 * key of a concrete type is untouched, so a schema that omits one, or types one wrongly, still
 * fails to compile. That is the property worth keeping, and it is kept.
 */
type Mirrorable<T> = T extends readonly (infer U)[]
  ? Mirrorable<U>[]
  : T extends Date
    ? T
    : T extends object
      ? { [K in keyof T as undefined extends T[K] ? never : K]: Mirrorable<T[K]> } & {
          [K in keyof T as undefined extends T[K] ? K : never]?: Mirrorable<T[K]> | undefined;
        }
      : T;

const iso = () => z.string().datetime();
const id = () => z.string().uuid();

/** A named ref, so `{ id, name }` pairs read as one thing in the document. */
const named = z.object({ id: z.string(), name: z.string() });

const Tier = z.enum(TIERS);
const Scope = z.enum(SCOPES);
const ReflectState = z.enum(REFLECT_STATES);
const StatWindow = z.enum(StatWindows);

/**
 * ALL 73 CAPABILITIES, ENUMERATED IN THE DOCUMENT. `11` §3 is the catalogue and this is it on
 * the wire — a reader of the spec can see the entire vocabulary of things anyone can be
 * permitted to do, which is the single most useful thing this API's documentation can show.
 */
const CapabilityEnum = z.enum(CAPABILITIES as [Capability, ...Capability[]]);

const Label = z.object({ one: z.string(), many: z.string() });
const Labels = z.record(z.string(), Label);

/**
 * THE FIVE VOCABULARY KEYS, NAMED. `22` §2 — `ResolvedLabels` is a fixed record, not an open
 * one, and spelling the keys out is the single most illustrative thing this document contains:
 * it is INV-001 visible on the wire. Switch organisation and the same five keys come back
 * saying Property, Restaurant, Guest — with no code change anywhere.
 */
const ResolvedLabelsSchema = z.object({
  unit: Label,
  subject: Label,
  respondent: Label,
  reviewee: Label,
  campaign: Label,
});

const DecidedBy = z.object({
  via: z.enum(['role', 'position', 'group', 'person', 'delegation', 'default']),
  grantId: z.string().optional(),
  subjectName: z.string().optional(),
  scope: z.string().optional(),
  anchorUnitId: z.string().optional(),
  anchorUnitName: z.string().optional(),
  effect: z.enum(['allow', 'deny']).optional(),
});

/** `10` §2's account lifecycle, as the four states `57` § States names. */
export const AccountStatusSchema = mirrors<AccountStatus>()(
  z.discriminatedUnion('state', [
    z.object({ state: z.literal('none') }),
    z.object({ state: z.literal('invited'), expiresAt: iso(), invitedAt: iso() }),
    z.object({ state: z.literal('active'), lastLoginAt: iso().nullable() }),
    z.object({ state: z.literal('disabled'), disabledAt: iso().nullable() }),
  ]),
);

export const PositionSchema = mirrors<Position>()(
  z.object({
    edgeId: z.string(),
    roleId: z.string().nullable(),
    roleName: z.string(),
    roleLevel: z.number().nullable(),
    unitId: z.string().nullable(),
    unitName: z.string(),
    isPrimary: z.boolean(),
    validTo: z.string().nullable(),
  }),
);

export const PowersAtPlaceSchema = mirrors<PowersAtPlace>()(
  z.object({
    unitId: z.string(),
    unitName: z.string(),
    roleName: z.string(),
    capabilities: z.array(z.object({ capability: z.string(), scope: z.string() })),
  }),
);

export const PersonSummarySchema = mirrors<PersonSummary>()(
  z.object({
    id: z.string(),
    userId: z.string().nullable(),
    name: z.string(),
    email: z.string().nullable(),
    positions: z.array(PositionSchema),
    createdAt: iso(),
    account: AccountStatusSchema,
  }),
);

export const PersonDetailSchema = mirrors<PersonDetail>()(
  PersonSummarySchema.extend({ powersByPlace: z.array(PowersAtPlaceSchema) }),
);

export const ImportPreviewSchema = mirrors<ImportPreview>()(
  z.object({
    columns: z.array(z.string()),
    sample: z.array(ImportRow),
    rowCount: z.number(),
    unmatchedRoles: z.array(z.string()),
    unmatchedUnits: z.array(z.string()),
    existingEmails: z.array(z.string()),
  }),
);

export const AccountInviteSchema = mirrors<AccountInvite>()(
  z.object({ url: z.string(), expiresAt: iso(), personName: z.string() }),
);

export const ActivationPreviewSchema = mirrors<ActivationPreview>()(
  z.object({
    personName: z.string(),
    organizationName: z.string(),
    organizationLogoUrl: z.string().nullable(),
    expiresAt: iso(),
  }),
);

export const MeResponseSchema = mirrors<MeResponse>()(
  z.object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      avatarUrl: z.string().nullable(),
    }),
    organization: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      industry: z.string(),
    }),
    labels: Labels,
    // The map `useCan()` reads: capability → the WIDEST scope it is held at. Absent means not
    // held. It is what the UI may OFFER and never what the caller may DO (INV-003).
    capabilities: z.record(z.string(), Scope),
    support: z
      .object({
        viewer: z.enum(['operator', 'member']),
        operatorName: z.string(),
        operatorEmail: z.string(),
        reason: z.string(),
        startedAt: iso(),
        expiresAt: iso(),
      })
      .optional(),
  }),
);

export const ProfileViewSchema = mirrors<ProfileView>()(
  z.object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      avatarUrl: z.string().nullable(),
      lastLoginAt: iso().nullable(),
    }),
    positions: z.array(PositionSchema),
    powersByPlace: z.array(PowersAtPlaceSchema),
  }),
);

export const OrgViewSchema = mirrors<OrgView>()(
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    industry: z.string(),
    labels: Labels,
    configured: z.boolean(),
    logoUrl: z.string().nullable(),
    createdAt: iso(),
  }),
);

export const PresetViewSchema = mirrors<PresetView>()(
  z.object({
    key: Industry,
    displayName: z.string(),
    roles: z.array(z.object({ name: z.string() })),
    units: z.array(
      z.object({ tempId: z.string(), name: z.string(), parentTempId: z.string().nullable() }),
    ),
    labels: Labels,
    templates: z.array(
      z.object({ name: z.string(), category: z.string(), questionCount: z.number() }),
    ),
  }),
);

/** Recursive: the org tree is a graph, and `db/graph.ts`'s CTE returns it nested. */
export const UnitNodeSchema: z.ZodType<UnitNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().nullable(),
    isTemporary: z.boolean(),
    endsAt: iso().nullable(),
    peopleCount: z.number(),
    subjectCount: z.number(),
    peopleTotal: z.number(),
    subjectTotal: z.number(),
    children: z.array(UnitNodeSchema),
  }),
);

export const UnitTreeTotalsSchema = mirrors<UnitTreeTotals>()(
  z.object({ people: z.number(), subjects: z.number(), units: z.number() }),
);

export const UnitCompositionSchema = mirrors<UnitComposition>()(
  z.object({
    unitId: z.string(),
    total: z.number(),
    byRole: z.array(
      z.object({
        roleId: z.string(),
        roleName: z.string(),
        level: z.number(),
        count: z.number(),
      }),
    ),
  }),
);

const ImpactRow = z.object({ personId: z.string(), name: z.string(), capability: z.string() });

export const UnitImpactSchema = mirrors<UnitImpact>()(
  z.object({
    unitId: z.string(),
    unitName: z.string(),
    descendantCount: z.number(),
    peopleAffected: z.number(),
    subjectsAffected: z.number(),
    campaignsAffected: z.number(),
    gained: z.array(ImpactRow),
    lost: z.array(ImpactRow),
  }),
);

export const RoleViewSchema = mirrors<RoleView>()(
  z.object({
    id: z.string(),
    name: z.string(),
    level: z.number(),
    peopleCount: z.number(),
    grantCount: z.number(),
  }),
);

export const GrantWarningSchema = mirrors<GrantWarning>()(
  z.object({
    kind: z.enum([
      'orphan_capability',
      'nobody_can',
      'self_approval',
      'deny_shadows_allow',
      'thin_starter_row',
    ]),
    message: z.string(),
    capability: z.string().optional(),
    roleId: z.string().optional(),
  }),
);

export const CapabilityMetaSchema = mirrors<CapabilityMeta>()(
  z.object({
    key: z.string(),
    module: z.string(),
    label: z.string(),
    phase: z.string(),
  }),
);

/**
 * The simulator's answer, and `considered` is the half that makes it worth having. `42`: a bare
 * "blocked" teaches nothing; the trace names the rule that decided and every rule that did not.
 */
export const DecisionViewSchema = z.object({
  allowed: z.boolean(),
  capability: CapabilityEnum,
  reason: z.enum(['granted', 'explicit_deny', 'out_of_scope', 'expired', 'no_grant']),
  decidedBy: DecidedBy.optional(),
  considered: z
    .array(
      z.object({
        grantId: z.string(),
        via: z.string(),
        scope: z.string(),
        effect: z.string(),
        rejectedBecause: z.string().optional(),
      }),
    )
    .optional(),
});

export const AuditEntrySchema = mirrors<AuditEntry>()(
  z.object({
    id: z.string(),
    at: iso(),
    actor: z
      .object({ id: z.string(), name: z.string(), avatarUrl: z.string().nullable() })
      .nullable(),
    action: z.string(),
    target: z
      .object({
        type: z.string(),
        id: z.string().nullable(),
        name: z.string().nullable(),
      })
      .nullable(),
    outcome: AuditOutcome,
    decidedBy: DecidedBy.nullable(),
    requestId: z.string().nullable(),
  }),
);

export const SubjectSummarySchema = mirrors<SubjectSummary>()(
  z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    unitId: z.string().nullable(),
    unitName: z.string().nullable(),
    linkedUserId: z.string().nullable(),
    linkedUserName: z.string().nullable(),
    activeCampaigns: z.number(),
    totalResponses: z.number(),
    lastResponseAt: iso().nullable(),
    archivedAt: iso().nullable(),
    createdAt: iso(),
  }),
);

export const SubjectDetailSchema = mirrors<SubjectDetail>()(
  SubjectSummarySchema.extend({
    cycles: z.array(
      z.object({
        campaignId: z.string(),
        campaignName: z.string(),
        status: CampaignStatus,
        startsAt: iso().nullable(),
        endsAt: iso().nullable(),
        closedAt: iso().nullable(),
        responseCount: z.number(),
      }),
    ),
  }),
);

const TemplateQuestion = z.object({
  id: z.string(),
  kind: QuestionKind,
  text: z.string(),
  config: QuestionConfig,
  required: z.boolean(),
  position: z.number(),
});

export const TemplateSummarySchema = mirrors<TemplateSummary>()(
  z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    description: z.string().nullable(),
    industry: z.string().nullable(),
    questionCount: z.number(),
    estimatedSeconds: z.number(),
    campaignCount: z.number(),
    isLibrary: z.boolean(),
    clonedFromId: z.string().nullable(),
    createdAt: iso(),
  }),
);

export const TemplateDetailSchema = mirrors<TemplateDetail>()(
  TemplateSummarySchema.extend({
    questions: z.array(TemplateQuestion),
    readOnly: z.boolean(),
  }),
);

export const CampaignSummarySchema = mirrors<CampaignSummary>()(
  z.object({
    id: z.string(),
    name: z.string(),
    status: CampaignStatus,
    templateId: z.string(),
    templateName: z.string(),
    templateCategory: z.string(),
    subjectCount: z.number(),
    responseCount: z.number(),
    resultsThreshold: z.number(),
    anonymous: z.boolean(),
    access: CampaignAccess,
    startsAt: iso().nullable(),
    endsAt: iso().nullable(),
    closedAt: iso().nullable(),
    publicToken: z.string().nullable(),
    url: z.string().nullable(),
    createdAt: iso(),
  }),
);

export const CampaignDetailSchema = mirrors<CampaignDetail>()(
  CampaignSummarySchema.extend({
    audience: AudienceRule,
    subjects: z.array(
      z.object({ id: z.string(), name: z.string(), unitName: z.string().nullable() }),
    ),
  }),
);

export const AudiencePreviewSchema = mirrors<AudiencePreview>()(
  z.object({ estimatedCount: z.number(), sample: z.array(named) }),
);

export const LaunchResultSchema = mirrors<LaunchResult>()(
  z.object({ publicToken: z.string(), url: z.string(), status: CampaignStatus }),
);

/**
 * K-ANONYMITY IS VISIBLE IN THE SCHEMA, and that is not a documentation flourish — it is how
 * the type enforces it (`INV-006`, `52` §2). Below `K_ANON_THRESHOLD` the body has NO
 * `questions` key at all, so a caller cannot read results that do not exist by forgetting to
 * check `suppressed`.
 */
export const ResultsViewSchema = mirrors<ResultsView>()(
  z.object({
    responseCount: z.number(),
    audienceEstimate: z.number().nullable(),
    responseRate: z.number().nullable(),
    newSince: iso().optional(),
    suppressed: z.boolean(),
    threshold: z.number(),
    questions: z
      .array(
        z.object({
          questionId: z.string(),
          kind: QuestionKind,
          text: z.string(),
          answered: z.number(),
          average: z.number().optional(),
          distribution: z
            .array(
              z.object({
                label: z.string(),
                count: z.number(),
                percent: z.number(),
                valence: Valence.optional(),
              }),
            )
            .optional(),
          npsMix: z
            .object({
              promoters: z.number(),
              passives: z.number(),
              detractors: z.number(),
              score: z.number(),
            })
            .optional(),
        }),
      )
      .optional(),
  }),
);

export const QuestionSummarySchema = mirrors<QuestionSummary>()(
  z.object({
    questionId: z.string(),
    kind: QuestionKind,
    text: z.string(),
    answered: z.number(),
    average: z.number().optional(),
    distribution: z
      .array(
      z.object({
        label: z.string(),
        count: z.number(),
        percent: z.number(),
        valence: Valence.optional(),
      }),
      )
      .optional(),
    npsMix: z
      .object({
        promoters: z.number(),
        passives: z.number(),
        detractors: z.number(),
        score: z.number(),
      })
      .optional(),
  }),
);

export const ResponseItemSchema = mirrors<ResponseItem>()(
  z.object({
    id: z.string(),
    submittedAt: iso(),
    subjectName: z.string().nullable(),
    answers: z.array(
      z.object({ questionId: z.string(), questionText: z.string(), text: z.string() }),
    ),
  }),
);

export const InboxResponseSchema = mirrors<InboxResponse>()(
  z.object({
    id: z.string(),
    questionId: z.string(),
    at: iso(),
    campaign: named,
    subject: named.nullable(),
    comment: z.string(),
    questionText: z.string(),
    score: z.number().nullable(),
    scoreMax: z.number().nullable(),
    read: z.boolean(),
    archived: z.boolean(),
  }),
);

export const InboxMessageSchema = mirrors<InboxMessage>()(
  z.object({
    id: z.string(),
    at: iso(),
    kind: z.string(),
    subject: z.string(),
    body: z.string(),
    read: z.boolean(),
  }),
);

export const ThemeSummarySchema = mirrors<ThemeSummary>()(
  z.object({
    id: z.string(),
    label: z.string(),
    mentions: z.number(),
    score: z.number(),
    valence: Valence,
    delta: z.number().nullable(),
  }),
);

export const ThemeDetailSchema = mirrors<ThemeDetail>()(
  ThemeSummarySchema.extend({
    comments: z.array(
      z.object({
        responseId: z.string(),
        questionId: z.string(),
        at: iso(),
        campaign: named,
        subject: named.nullable(),
        questionText: z.string(),
        comment: z.string(),
        score: z.number().nullable(),
        scoreMax: z.number().nullable(),
        valence: Valence,
      }),
    ),
  }),
);

export const AnalysisViewSchema = mirrors<AnalysisView>()(
  z.object({
    suppressed: z.boolean(),
    threshold: z.number(),
    reliability: z.object({
      responseCount: z.number(),
      audienceEstimate: z.number().nullable(),
      responseRate: z.number().nullable(),
      confidence: z.enum(['low', 'medium', 'high']),
    }),
    sentiment: z
      .object({ positive: z.number(), neutral: z.number(), negative: z.number() })
      .optional(),
    trend: z
      .array(
        z.object({
          date: z.string(),
          positive: z.number(),
          neutral: z.number(),
          negative: z.number(),
        }),
      )
      .optional(),
    themes: z.array(ThemeSummarySchema).optional(),
    drivers: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          impact: z.number(),
          valence: Valence,
        }),
      )
      .optional(),
    commentCount: z.number().optional(),
  }),
);

export const AnnouncementSummarySchema = mirrors<AnnouncementSummary>()(
  z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    audience: AudienceRule,
    publishedAt: iso().nullable(),
    createdAt: iso(),
    authorName: z.string().nullable(),
    recipients: z.number(),
    read: z.number(),
    readByMe: z.boolean().nullable(),
  }),
);

export const AnnouncementPreviewSchema = mirrors<AnnouncementPreview>()(
  z.object({ recipients: z.number() }),
);

export const HomeViewSchema = mirrors<HomeView>()(
  z.object({
    stats: z.object({
      window: StatWindow,
      responses: z.number(),
      subjectsCovered: z.number(),
      activeCampaigns: z.number(),
      responseRate: z.number().nullable(),
      responsesEver: z.number(),
    }),
    activeCampaigns: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          subjectCount: z.number(),
          responseCount: z.number(),
          endsAt: iso().nullable(),
          url: z.string().nullable(),
          anonymous: z.boolean(),
          access: CampaignAccess,
        }),
      )
      .optional(),
    recentComments: z
      .array(
        z.object({
          text: z.string(),
          subjectName: z.string().nullable(),
          submittedAt: iso(),
        }),
      )
      .optional(),
    prompts: z.array(
      z.object({
        kind: z.enum(['no_subjects', 'no_campaigns', 'setup_incomplete', 'seats_over']),
        href: z.string(),
      }),
    ),
    configured: z.boolean(),
  }),
);

export const ReflectionCycleSchema = mirrors<ReflectionCycle>()(
  z.object({
    campaignId: z.string(),
    campaignName: z.string(),
    subjectId: z.string(),
    subjectName: z.string(),
    status: ReflectState,
    endsAt: iso().nullable(),
    closed: z.boolean(),
    reflectedAt: iso().nullable(),
    planId: z.string().nullable(),
    planFinalisedAt: iso().nullable(),
  }),
);

export const PlanViewSchema = z.object({
  id: z.string(),
  items: z.array(PlanItem),
  finalisedAt: iso().nullable(),
  checkins: z.array(
    z.object({
      id: z.string(),
      supervisorName: z.string(),
      notes: z.string().nullable(),
      heldAt: iso().nullable(),
      finalisedAt: iso().nullable(),
    }),
  ),
});

export const GapViewSchema = mirrors<GapView>()(
  z.object({
    campaignId: z.string(),
    campaignName: z.string(),
    subjectId: z.string(),
    subjectName: z.string(),
    reflectedAt: iso(),
    suppressed: z.boolean(),
    threshold: z.number(),
    responseCount: z.number(),
    rows: z
      .array(
        z.object({
          questionId: z.string(),
          text: z.string(),
          self: z.number().nullable(),
          received: z.number().nullable(),
          delta: z.number().nullable(),
          scaleMax: z.number().nullable(),
        }),
      )
      .optional(),
    plan: PlanViewSchema.nullable(),
  }),
);

export const ReflectionFormSchema = mirrors<ReflectionForm>()(
  z.object({
    campaignId: z.string(),
    campaignName: z.string(),
    subjectId: z.string(),
    subjectName: z.string(),
    questions: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        text: z.string(),
        config: z.unknown(),
        required: z.boolean(),
        position: z.number(),
      }),
    ),
    answers: z
      .array(z.object({ questionId: z.string(), value: AnswerValue }))
      .nullable(),
  }),
);

export const BillingSummarySchema = mirrors<BillingSummary>()(
  z.object({
    tier: Tier,
    status: BillingStatus,
    periodStart: iso(),
    periodEnd: iso(),
    pendingTier: Tier.nullable(),
    lapsedFrom: Tier.nullable(),
    seats: z.number(),
    seatBreakdown: z.object({ activeUsers: z.number(), nonPersonSubjects: z.number() }),
  }),
);

export const PaymentRecordSchema = mirrors<PaymentRecord>()(
  z.object({
    id: z.string(),
    at: iso(),
    tier: Tier,
    fromTier: Tier.nullable(),
    kind: z.enum(['signup', 'change', 'expiry', 'lapse']),
    // MINOR UNITS, ALWAYS — `DEC-080`. A rupee amount as a float is an accounting document
    // that disagrees with itself at the third decimal place.
    amountMinor: z.number(),
    currency: z.literal('INR'),
    payerName: z.string(),
    reference: z.string(),
  }),
);

export const EnterpriseRequestStateSchema = mirrors<EnterpriseRequestState>()(
  z.object({ requestedAt: iso().nullable() }),
);

const SlotView = z.object({
  id: z.string(),
  startsAt: iso(),
  endsAt: iso(),
  capacity: z.number(),
  remaining: z.number(),
});

export const BookableSummarySchema = mirrors<BookableSummary>()(
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    subjectId: z.string().nullable(),
    subjectName: z.string().nullable(),
    publicToken: z.string().nullable(),
    url: z.string().nullable(),
    closedAt: iso().nullable(),
    createdAt: iso(),
    slots: z.array(SlotView),
    booked: z.number(),
  }),
);

export const BookingSummarySchema = mirrors<BookingSummary>()(
  z.object({
    id: z.string(),
    slotId: z.string(),
    startsAt: iso(),
    endsAt: iso(),
    name: z.string(),
    email: z.string(),
    cancelledAt: iso().nullable(),
    createdAt: iso(),
  }),
);

export const PublicBookableSchema = mirrors<PublicBookable>()(
  z.object({
    name: z.string(),
    description: z.string().nullable(),
    orgName: z.string(),
    // NO `capacity` — a respondent is told what is left, never how full it is. Publishing the
    // capacity would let a stranger infer how many colleagues booked which slot.
    slots: z.array(
      z.object({ id: z.string(), startsAt: iso(), endsAt: iso(), remaining: z.number() }),
    ),
  }),
);

export const BookingReceiptSchema = mirrors<BookingReceipt>()(
  z.object({ cancelToken: z.string(), startsAt: iso(), endsAt: iso() }),
);

export const PublicCampaignSchema = mirrors<PublicCampaign>()(
  z.object({
    campaignName: z.string(),
    organizationName: z.string(),
    labels: ResolvedLabelsSchema,
    anonymous: z.boolean(),
    access: CampaignAccess,
    estimatedSeconds: z.number(),
    subjects: z.array(named),
    questions: z.array(TemplateQuestion),
  }),
);

export const SubmitResultSchema = z.object({ ok: z.literal(true), responseCount: z.number() });

/* -------------------------------------------------------------------------- */
/* Platform — `19`. A separate catalogue, a separate principal, separate shapes */
/* -------------------------------------------------------------------------- */

export const PlatformMeResponseSchema = mirrors<PlatformMeResponse>()(
  z.object({
    operator: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.enum(['owner', 'staff']),
    }),
    // The operator's own catalogue, enumerated — the platform twin of `CapabilityEnum`, and
    // kept rigidly separate from it (19 §4). A `platform.` string must never reach the org
    // catalogue, and a document that showed one list would suggest they are interchangeable.
    capabilities: z.array(z.enum(PLATFORM_CAPABILITIES as [PlatformCapability, ...PlatformCapability[]])),
  }),
);

export const PlatformOrgSummarySchema = mirrors<PlatformOrgSummary>()(
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    industry: z.string(),
    tier: Tier,
    subscriptionStatus: z.string(),
    periodEnd: iso().nullable(),
    lapsedFrom: Tier.nullable(),
    seats: z.number(),
    seatLimit: z.number().nullable(),
    activeCampaigns: z.number(),
    // A COUNT. `INV-011` as a type: no field on this contract could carry a response.
    responsesLast30d: z.number(),
    lastActivityAt: iso().nullable(),
    suspendedAt: iso().nullable(),
    createdAt: iso(),
  }),
);

export const PlatformOrgDetailSchema = mirrors<PlatformOrgDetail>()(
  PlatformOrgSummarySchema.extend({
    counts: z.object({
      units: z.number(),
      roles: z.number(),
      people: z.number(),
      subjects: z.number(),
      campaigns: z.number(),
      responses: z.number(),
    }),
    administrators: z.array(z.object({ id: z.string(), name: z.string(), email: z.string() })),
    planHistory: z.array(z.object({ at: iso(), tier: Tier, by: z.string() })),
  }),
);

export const PlatformStatsSchema = mirrors<PlatformStats>()(
  z.object({
    organizations: z.number(),
    suspended: z.number(),
    // `Record<Tier, number>` — a FIXED four-key record, not an open one, so the tiers are named.
    // The document is better for it: a reader sees the whole tier vocabulary in the response.
    byTier: z.object({
      bronze: z.number(),
      silver: z.number(),
      gold: z.number(),
      enterprise: z.number(),
    }),
    seats: z.number(),
    campaigns: z.number(),
    responses: z.number(),
  }),
);

export const PlatformAuditEntrySchema = mirrors<PlatformAuditEntry>()(
  z.object({
    id: z.string(),
    at: iso(),
    actor: named.nullable(),
    action: z.string(),
    org: named.nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    requestId: z.string().nullable(),
  }),
);

export const PlatformOperatorSchema = mirrors<PlatformOperator>()(
  z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['owner', 'staff']),
    status: z.string(),
    lastLoginAt: iso().nullable(),
  }),
);

const Window = z.object({
  from: z.string(),
  to: z.string(),
  granularity: z.enum(['month', 'quarter']),
});

export const PlatformAnalyticsSchema = mirrors<PlatformAnalytics>()(
  z.object({
    window: Window,
    orgs: z.object({
      total: z.number(),
      joined: z.number(),
      trialing: z.number(),
      cancelled: z.number(),
    }),
    byTier: z.array(z.object({ tier: Tier, orgs: z.number() })),
    movement: z.array(
      z.object({
        period: z.string(),
        new: z.number(),
        upgraded: z.number(),
        downgraded: z.number(),
        churned: z.number(),
      }),
    ),
    adoption: z.object({
      orgsWithACampaign: z.number(),
      orgsWithAResponse: z.number(),
      orgsQuiet30d: z.number(),
    }),
    totals: z.object({ campaigns: z.number(), responses: z.number() }),
  }),
);

const EarningsPayment = PaymentRecordSchema.extend({
  orgId: z.string(),
  orgName: z.string(),
});

export const PlatformEarningsSchema = mirrors<PlatformEarnings>()(
  z.object({
    window: Window,
    currency: z.literal('INR'),
    totals: z.object({
      revenueMinor: z.number(),
      payments: z.number(),
      orgsPaying: z.number(),
      averageMinor: z.number().nullable(),
      lifetimeRevenueMinor: z.number(),
    }),
    byPeriod: z.array(
      z.object({ period: z.string(), revenueMinor: z.number(), payments: z.number() }),
    ),
    byTier: z.array(
      z.object({
        tier: Tier,
        payments: z.number(),
        revenueMinor: z.number(),
        orgsOnTier: z.number(),
      }),
    ),
    tierOverTime: z.array(
      z.object({
        period: z.string(),
        bronze: z.number(),
        silver: z.number(),
        gold: z.number(),
      }),
    ),
    recent: z.array(EarningsPayment),
    recentChanges: z.array(EarningsPayment),
  }),
);

export const LogFileMetaSchema = mirrors<LogFileMeta>()(
  z.object({
    name: z.string(),
    stream: z.enum(['app', 'error']),
    date: z.string(),
    bytes: z.number(),
    lines: z.number().nullable(),
    modifiedAt: iso(),
  }),
);

export const LogStoreMetaSchema = mirrors<LogStoreMeta>()(
  z.object({
    dir: z.string(),
    enabled: z.boolean(),
    retentionDays: z.number(),
    maxSizeMb: z.number(),
  }),
);

export const LogLineSchema = mirrors<LogLine>()(
  z.object({
    at: z.string(),
    level: z.number(),
    msg: z.string(),
    requestId: z.string().optional(),
    method: z.string().optional(),
    path: z.string().optional(),
    status: z.number().optional(),
    durationMs: z.number().optional(),
    orgId: z.string().optional(),
    principal: z.string().optional(),
    err: z
      .object({
        type: z.string(),
        message: z.string(),
        stack: z.string().optional(),
      })
      .optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
);

export const EnterpriseRequestRowSchema = mirrors<EnterpriseRequestRow>()(
  z.object({
    id: z.string(),
    at: iso(),
    org: z.object({ id: z.string(), name: z.string(), tier: Tier }),
    askedName: z.string(),
    askedEmail: z.string(),
    note: z.string().nullable(),
    status: z.enum(['open', 'contacted', 'closed']),
    handledAt: iso().nullable(),
  }),
);

export const SupportSessionRowSchema = mirrors<SupportSessionRow>()(
  z.object({
    id: z.string(),
    org: named,
    operator: z.object({ id: z.string(), name: z.string(), email: z.string() }),
    reason: z.string(),
    startedAt: iso(),
    expiresAt: iso(),
    endedAt: iso().nullable(),
    active: z.boolean(),
  }),
);

export const EnterSupportResponseSchema = mirrors<EnterSupportResponse>()(
  z.object({
    session: SupportSessionRowSchema,
    redirectTo: z.string(),
    deniedCapabilities: z.array(z.string()),
  }),
);

/* -------------------------------------------------------------------------- */
/* Envelopes — the three shapes every route in the product answers with        */
/* -------------------------------------------------------------------------- */

/** `{ ok: true }`. Logout, mark-read, and the rest of the "it happened" routes. */
export const Ok = z.object({ ok: z.literal(true) });

/** `{ data: T }`. One thing. */
export const data = <T extends z.ZodTypeAny>(inner: T) => z.object({ data: inner });

/**
 * `13` §4's paginated envelope, exactly. `meta.total` is SCOPE-FILTERED — it counts what the
 * caller may see, not what exists (INV-003), which is the one thing about it a reader of this
 * document could not guess.
 */
export const page = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    data: z.array(inner),
    page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
    meta: z.object({ total: z.number() }),
  });

/** The unpaginated list — `{ data: T[] }` plus whatever `meta` that route carries. */
export const list = <T extends z.ZodTypeAny>(inner: T) => z.object({ data: z.array(inner) });

export { id, iso, named, Tier, Scope, CapabilityEnum, Labels, Label, ResolvedLabelsSchema, DecidedBy };
