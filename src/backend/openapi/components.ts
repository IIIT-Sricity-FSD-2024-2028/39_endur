// The response shapes for the API document, written once here in Zod.
// Requests need no such file, because validate() already parses every request against a schema.
// Two things keep these honest: mirrors<T>() fails the build when a schema does not match the shared
// TypeScript type, and openapi.test.ts parses real responses through them, which catches extra fields.
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

// The compile-time half: a schema whose output does not match the shared type is a type error right here.
const mirrors =
  <T>() =>
  <S extends z.ZodType<Mirrorable<T>, z.ZodTypeDef, unknown>>(schema: S): S =>
    schema;

// A narrow widening for optional fields only, so one optional key cannot force a cast that would switch the check off.
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

// A named { id, name } pair, so it reads as one thing in the document.
const named = z.object({ id: z.string(), name: z.string() });

const Tier = z.enum(TIERS);
const Scope = z.enum(SCOPES);
const ReflectState = z.enum(REFLECT_STATES);
const StatWindow = z.enum(StatWindows);

// Every capability, listed out, so a reader can see the whole vocabulary of things anyone can be allowed to do.
const CapabilityEnum = z.enum(CAPABILITIES as [Capability, ...Capability[]]);

const Label = z.object({ one: z.string(), many: z.string() });
const Labels = z.record(z.string(), Label);

// The five vocabulary keys, named. Switch organisation and the same keys come back saying Property, Guest, and so on.
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

// The four states an account can be in.
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
    // The map useCan() reads: capability -> the widest scope it is held at. It says what the UI may OFFER, never what the caller may DO.
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

// Recursive, because the org tree is a tree and the database returns it already nested.
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

// The simulator's answer. 'considered' is the useful half: it names the rule that decided and the ones that did not.
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

// Anonymity is visible in the type: below the k-anonymity threshold the body has no questions key at all.
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
    // Always minor units (paise). Money as a decimal number disagrees with itself at the third place.
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
    // No capacity field: a respondent is told what is left, never how full a slot is.
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

// Platform shapes for Endur's own operators: a separate catalogue and a separate principal.

export const PlatformMeResponseSchema = mirrors<PlatformMeResponse>()(
  z.object({
    operator: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.enum(['owner', 'staff']),
    }),
    // The operator's own catalogue, kept strictly apart from the organisation one.
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
    // A count only: no field on this contract could carry a response.
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
    // A fixed four-key record, so every tier name appears in the document.
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

// The three envelope shapes every route in the product answers with.

// { ok: true } - logout, mark-read, and the other "it happened" replies.
export const Ok = z.object({ ok: z.literal(true) });

// { data: T } - one thing.
export const data = <T extends z.ZodTypeAny>(inner: T) => z.object({ data: inner });

// The paginated envelope. meta.total counts what the caller may see, not what exists.
export const page = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    data: z.array(inner),
    page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
    meta: z.object({ total: z.number() }),
  });

// The unpaginated list: { data: T[] } plus whatever meta that route carries.
export const list = <T extends z.ZodTypeAny>(inner: T) => z.object({ data: z.array(inner) });

export { id, iso, named, Tier, Scope, CapabilityEnum, Labels, Label, ResolvedLabelsSchema, DecidedBy };
