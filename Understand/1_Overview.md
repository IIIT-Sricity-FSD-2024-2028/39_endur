# 1 — Codebase Overview: `packages/` and `src/`

Endur is a multi-tenant feedback-management and performance-analysis platform. The code that
runs the product lives in two top-level folders:

| Top-level folder | What it contains |
|---|---|
| `packages/` | `@endur/shared` — the single source of truth shared by client and server: Zod DTO schemas, the capability catalogue, error codes, label/vocabulary definitions, pricing tiers. No framework code, no I/O. |
| `src/` | The application itself, in two sub-trees. `src/backend` is the Express 5 + Prisma + PostgreSQL API (middleware chain, authorisation resolver, feature services, migrations, seeds, tests). `src/frontend` is the React 18 + Vite SPA (router, pages, components, per-feature data hooks, Redux store, design-system CSS). |

Both trees are TypeScript. The frontend imports types and Zod schemas from `packages/shared`;
the backend validates every request against the same schemas. That shared package is what keeps
the two halves in agreement.

---

# Part 1 — `packages/`

| Sub-folder | Contains |
|---|---|
| `packages/shared/` | The `@endur/shared` workspace package. Root holds the manifest and TS config; all code sits under `src/`. |
| `packages/shared/src/` | Contract core — capabilities, scopes, labels, vocabularies, tiers, error codes. |
| `packages/shared/src/dto/` | One Zod module per domain area. Each exports request-body schemas, response view types, and `dto(...)` route descriptors consumed by the backend's `validate` middleware. |

## 1.1 `packages/shared/` — root files

| File | Contains / does |
|---|---|
| `package.json` | Workspace manifest for `@endur/shared`; build script and the `zod` dependency. |
| `tsconfig.json` | TypeScript project config; emits the declarations that backend and frontend consume. |
| `tsconfig.tsbuildinfo` | Generated incremental-build cache. Not source. |

## 1.2 `packages/shared/src/` — contract core

| File | Key exports | What it does |
|---|---|---|
| `index.ts` | re-exports every module below | Single public entry point of the package. |
| `capabilities.ts` | `CAPABILITY_CATALOGUE`, `CAPABILITIES`, `Capability`, `isCapability`, `SCOPES`, `Scope`, `SCOPE_BREADTH`, `scopeReaches`, `HeldCapabilities`, `EFFECTS`, `Effect`, `CapabilityPhase`, `CapabilityModule` | The authoritative capability catalogue — every permission name in the product declared once, with module and phase. Also defines the five scopes and their breadth ordering, which the GRANT resolver uses to decide which grant is more specific. |
| `capability-labels.ts` | `describeCapability()`, `CAPABILITIES_WITH_PHRASES`, `capabilityHasPhrase` | Turns a capability id into a plain-English sentence using the org's resolved labels, so the powers grid never prints raw capability names. |
| `scope-labels.ts` | `GrantChoice`, `GRANT_CHOICES`, `choiceWord()`, `describeChoice()`, `describeCell()` | Plain-language wording for one powers-grid cell ("everyone", "their own unit", "nobody"). |
| `platform-capabilities.ts` | `PlatformRole`, `PLATFORM_CAPABILITY_CATALOGUE`, `PLATFORM_CAPABILITIES`, `PlatformCapability`, `platformRoleHas()`, `capabilitiesForRole()` | The separate capability set for platform operators (`/ops`), keyed by operator role. |
| `platform-quiet.ts` | `isQuietOrg()` | One predicate — is an organisation "quiet" (no recent responses or activity). Used by the estate list. |
| `errors.ts` | `ERROR_CODES`, `ErrorCode`, `statusForCode()`, `FieldError`, `DecidedBy`, `ErrorEnvelope`, `OUT_OF_SCOPE_CODE` | The closed set of API error codes, their HTTP status mapping, and the shape of the single error envelope every failed request returns. |
| `labels.ts` | `LabelKey`, `Label`, `LabelSet`, `ResolvedLabels`, `DEFAULT_LABELS`, `resolveLabels()` | The vocabulary system's core — the renameable domain nouns, their singular/plural forms, and the merge of stored org labels over defaults. Backs the "no domain noun is hardcoded" invariant. |
| `vocabularies.ts` | `PresetVocabulary`, `PRESET_VOCABULARIES`, `PITCH_KEYS` | The per-industry word sets (university, hospital, hotel, company, custom) offered by the setup wizard. |
| `tiers.ts` | `TIERS`, `Tier`, `SIGNUP_TIERS`, `SignupTier`, `isSignupTier`, `Currency`, `PlanOption`, `PLAN_OPTIONS`, `SIGNUP_PLAN_OPTIONS`, `priceOf()`, `changeCostMinor()`, `formatMoney()`, `tierRank()` | Pricing and plan maths: the tier ladder, per-tier prices per currency, upgrade cost calculation, money formatting, tier ordering. |

## 1.3 `packages/shared/src/dto/` — request/response contracts

| File | Key exports | What it does |
|---|---|---|
| `index.ts` | `export *` of every DTO module | Barrel for all DTOs. |
| `common.ts` | `Id`, `Cursor`, `PageQuery`, `Page<T>`, `SearchQuery`, `nameField`, `textField`, `IdParam`, `dto()` | Shared primitives — id/cursor validators, pagination query plus page envelope, reusable name/text field rules, and `dto()`, the descriptor factory (`params`/`query`/`body`) every route pairs with the `validate` middleware. |
| `auth.ts` | `Credentials`, `LoginBody`, `RegisterBody`, `LoginDto`, `RegisterDto`, `MeResponse`, `AmbiguousAccounts` | Sign-in and registration bodies, the `/me` response (session, org, labels, held capabilities), and the multi-org disambiguation shape. |
| `org.ts` | `Industry`, `UpdateOrgBody`, `UpdateLabelsBody`, `SetupUnit`, `SetupOrgBody`, `OrgView`, `PresetView` | Organisation read view, settings updates, label updates, and the setup wizard's single commit payload. |
| `unit.ts` | `MAX_REPEAT`, `RepeatRange`, `parseUnitRange()`, `repeatCount`, `expandUnitNames()`, `CreateUnitBody`, `UpdateUnitBody`, `ReparentBody`, `DeleteUnitBody`, `UnitNode`, `UnitTreeTotals`, `UnitComposition`, `UnitImpact` | Org-graph node contracts plus the range syntax parser ("Block A–D") that expands one typed name into many units. |
| `role.ts` | `CreateRoleBody`, `UpdateRoleBody`, `ReorderRolesBody`, `DeleteRoleBody`, `RoleView` | Role-ladder CRUD and reordering. |
| `grant.ts` | `ScopeValue`, `EffectValue`, `GrantCell`, `PutGrantsBody`, `GrantWarning`, `CapabilityMeta` | The powers-grid contract — one cell is role × capability × scope × effect — plus the warnings returned when a write would lock someone out. |
| `person.ts` | `CreatePersonBody`, `UpdatePersonBody`, `CreateAssignmentBody`, `PersonListQuery`, `ImportRow`, `ImportPeopleBody`, `CSV_MAX_CHARS`, `ImportPreviewBody`, `Position`, `PersonSummary`, `PowersAtPlace`, `PersonDetail`, `ImportPreview` | People CRUD, role/unit assignment, and the two-step CSV import (preview, then commit). |
| `profile.ts` | `UpdateProfileBody`, `ChangePasswordBody`, `ProfileView` | The signed-in user acting on their own account. |
| `account.ts` | `ActivateAccountBody`, `ActivationToken`, `AccountInvite`, `AccountStatus`, `ActivationPreview` | Invite and activation flow for staff accounts, and the four account states. |
| `subject.ts` | `CreateSubjectBody`, `UpdateSubjectBody`, `SubjectListQuery`, `SubjectSummary`, `SubjectCycle`, `SubjectDetail` | Subjects — the generic "thing being reviewed" — CRUD, list query, detail view. |
| `template.ts` | `QuestionKind`, `QuestionConfig`, `QuestionInput`, `CreateTemplateBody`, `UpdateTemplateBody`, `PutQuestionsBody`, `CloneTemplateBody`, `TemplateSummary`, `TemplateDetail`, `SECONDS_PER_KIND`, `estimateSeconds()` | The six question types and their per-type config, template CRUD, whole-question-set replacement, and the fill-time estimator. |
| `campaign.ts` | `CampaignStatus`, `AudienceRule`, `CampaignAccess`, `CreateCampaignBody`, `UpdateCampaignBody`, `QuickCampaignPurpose`, `QuickCampaignBody`, `CampaignListQuery`, `CampaignSummary`, `CampaignDetail`, `AudiencePreview`, `LaunchResult` | Campaign lifecycle contracts, audience targeting rules, access mode, and the one-call "quick" poll / suggestion-box creation. |
| `response.ts` | `AnswerValue`, `SubmittedAnswer`, `SubmitResponseBody`, `PublicTokenParam`, `PublicCampaign`, `SubmitResult` | What a respondent sees and what they submit — the anonymous side of the product. |
| `results.ts` | `Valence`, `ResultsQuery`, `ResponsesQuery`, `QuestionSummary`, `ResultsView`, `ResponseItem` | Aggregated per-question results, the raw response list, and the CSV export descriptor. |
| `home.ts` | `StatWindows`, `StatWindow`, `HomeQuery`, `HomeView` | The console dashboard payload and its time-window selector. |
| `inbox.ts` | `InboxState`, `InboxQuery`, `InboxResponse`, `InboxMessage`, `InboxMessageQuery` | The response inbox (triage states) and the separate inbox of messages from the platform. |
| `analysis.ts` | `ThemeId`, `AnalysisQuery`, `ThemeSummary`, `AnalysisView`, `ThemeDetail` | The text-analysis layer — themes, sentiment, drivers, confidence — and the drill-through into one theme. |
| `improve.ts` | `REFLECT_STATES`, `SubmitReflectionBody`, `PlanItem`, `CreatePlanBody`, `CheckinBody`, `CheckinPatchBody`, `ReflectionCycle`, `GapRow`, `GapView`, `PlanView`, `ReflectionForm` | The improve loop — self-reflection, the self-versus-others gap, action plans, and check-ins. |
| `announcement.ts` | `CreateAnnouncementBody`, `UpdateAnnouncementBody`, `AnnouncementPreviewBody`, `AnnouncementSummary`, `AnnouncementPreview` | Org-wide announcements, with an audience preview before publishing. |
| `booking.ts` | `BookingToken`, `CreateBookableBody`, `UpdateBookableBody`, `SlotInput`, `PutSlotsBody`, `CreateBookingBody`, `SlotView`, `BookableSummary`, `BookingSummary`, `PublicBookable`, `BookingReceipt` | Bookable things, their slots, and the public token-based booking and cancellation flow. |
| `audit.ts` | `AuditOutcome`, `AuditQuery`, `DecisionView`, `AuditEntry` | The organisation's activity log, including the recorded authorisation decision behind each entry. |
| `authz.ts` | `SimulateTarget`, `SimulateBody`, `SimulateDto` | Input to the permission simulator — "why was this allowed or denied?". |
| `billing.ts` | `BillingStatus`, `BillingSummary`, `PaymentKind`, `PaymentRecord`, `JoinTierBody`, `ScheduleDowngradeBody`, `EnterpriseRequestBody`, `EnterpriseRequestState` | The organisation's own plan — current status, payment-ledger rows, upgrade and downgrade, Enterprise requests. |
| `platform.ts` | `PlatformLogin`, `EstateQuery`, `PlatformOrgSummary`, `PlatformOrgDetail`, `PlatformStats`, `PlatformAuditEntry`, `PlatformOperator`, `AnalyticsQuery`, `PlatformAnalytics`, `EarningsQuery`, `PlatformEarnings`, `LogFileMeta`, `LogStoreMeta`, `LogLine`, `LogReadQuery`, `LogExportQuery`, `EnterpriseStatus`, `EnterpriseQueueQuery`, `EnterpriseUpdate` | The whole `/ops` operator surface — estate listing, one org's detail, aggregate analytics and earnings, operator management, log browsing and export, and the Enterprise request queue. |

---

# Part 2 — `src/`

| Sub-folder | Contains |
|---|---|
| `src/backend/` | The Express 5 API: the middleware chain, the authorisation resolver, per-feature routers and services, Prisma schema, migrations and seeds, platform (`/ops`) internals, and the backend test suite. |
| `src/frontend/` | The React SPA: entry, router, layouts and guards, pages for three "worlds" (public, console, respond) plus the operator console, shared components, per-feature data hooks in `lib/`, the Redux store, and design-system CSS. |

---

## 2.1 `src/backend/`

| Sub-folder | Contains |
|---|---|
| *(root files)* | App composition and boot — `app.ts`, `server.ts`, Prisma and TS config, `vitest.config.ts`, `package.json`. |
| `auth/` | Staff password hashing, cookie sessions, invite tokens. |
| `authz/` | The GRANT resolver — candidate collection, scope matching, deny-beats-allow decision, visibility, escalation bound, caching, simulation. |
| `billing/` | Tier entitlements, billing period maths, effective tier, and the payment ledger writer. |
| `database/` | Prisma schema, SQL migrations, and the seed programs. |
| `db/` | Runtime database access — the Prisma singleton, the tenant-bound client, the transaction helper, the raw recursive-CTE graph queries, migration preflight. |
| `features/` | One folder per domain area, each with a `router.ts` (routes plus guards) and a `service.ts` (the logic), sometimes with extra pure helpers. |
| `lib/` | Cross-cutting infrastructure — config parsing, typed errors, logging and log rotation, pagination, storage, image sniffing, router mounting. |
| `logs/` | Rotating runtime log output (`app-*.log`, `error-*.log`). Generated, not source. |
| `middleware/` | The graded middleware chain — every link, in order, plus the four guards. |
| `platform/` | The operator (`/ops`) internals — the aggregate-only database seam, operator sessions, TOTP, platform audit, log reading. |
| `presets/` | The five industry presets and the seeded grant matrix. |
| `test/` | The Vitest suite for the backend, plus its database and setup helpers. |
| `dist/` | Generated build output. Not source. |

### 2.1.1 `src/backend/` — root files

| File | Key exports | What it does |
|---|---|---|
| `app.ts` | `createApp()` | **The middleware chain**, and the Phase-1 graded artifact. Assembles every link in order — request id, request logger, security, body parsing, rate limits, tenant resolution, authentication, CSRF, validation, guards, idempotency, audit writer, routers, not-found, error funnel. |
| `server.ts` | — | Boot and graceful shutdown. Imports `config` first so an invalid environment fails before a port is bound. |
| `prisma.config.ts` | default config | Points Prisma at the single repo-root `.env` instead of its own directory. |
| `package.json` | — | Backend scripts and dependencies. |
| `tsconfig.json`, `tsconfig.node.json` | — | Backend TypeScript configs. |
| `vitest.config.ts` | — | Test runner config — global setup, environment, and test-file matching. |

### 2.1.2 `src/backend/auth/`

| File | Key exports | What it does |
|---|---|---|
| `password.ts` | `hashPassword`, `verifyPassword()` | argon2id hashing and verification, chosen over bcrypt because it is memory-hard. |
| `session.ts` | `SESSION_COOKIE`, `sessionMiddleware`, `regenerate`, `destroy`, `save` | Cookie-backed staff sessions and the helpers to rotate, destroy, and persist them. |
| `inviteToken.ts` | `mintInviteToken()`, `hashInviteToken`, `activationUrlFor`, `INVITE_TTL_DAYS`, `expiryFrom` | The account-activation token — minting, hashing for storage, URL building, expiry. |

### 2.1.3 `src/backend/authz/` — the GRANT resolver

| File | Key exports | What it does |
|---|---|---|
| `index.ts` | re-exports of the folder | Public surface of the resolver. |
| `types.ts` | `Target`, `Via`, `CandidateGrant`, `DecisionReason`, `Decision` | The resolver's vocabulary — what is being asked, how a grant was reached, and the shape of a decision. |
| `collect.ts` | `collectGrants()` | Step 1 — gathers every grant that could apply, each paired with its anchor unit. |
| `scope.ts` | `ScopeContext`, `scopeCovers()` | Step 4 — does this grant's scope, anchored at this unit, actually cover the target? |
| `params.ts` | `ParamMode`, `combineParams()` | Step 6 — merges parameters across several surviving allows. |
| `resolve.ts` | `ResolveInput`, `resolve()` | The decision itself: narrowest match wins and an explicit deny always beats an allow. |
| `visibility.ts` | `Visibility`, `VisibilityInput`, `NOTHING`, `seesNothing`, `visibleUnits()` | The other half of the resolver — which units a caller can see at all, which is what row-level filtering depends on. |
| `held.ts` | `heldCapabilities()` | Computes the caller's capability set for the UI, returned with `/me` and consumed by `useCan()`. |
| `escalation.ts` | `EscalationFinding`, `BoundInput`, `findEscalation()` | The escalation bound — you cannot hand out a power you do not hold. |
| `cache.ts` | `getCachedGrants()`, `setCachedGrants()`, `clearGrantCache()` | Two cheap cache layers in front of grant collection, with explicit invalidation. |
| `simulate.ts` | `simulate` | Thin wrapper that runs a resolution and returns the full trace for the permission simulator. |

### 2.1.4 `src/backend/billing/`

| File | Key exports | What it does |
|---|---|---|
| `entitlements.ts` | `TIER_ENTITLEMENTS`, `tierIncludes`, `lowestTierFor`, re-exported `TIERS`/`Tier` | Which tier includes which capability, and the reverse lookup used to tell a caller what plan they would need. |
| `period.ts` | `BILLING_PERIOD_MONTHS`, `periodEndFrom()`, `newPeriod()`, `periodHasEnded()` | Billing-period maths in one place. |
| `effective.ts` | `PeriodFacts`, `effectiveTier()` | Which tier is actually in force today, given a subscription row and the date — handles scheduled downgrades and lapses. |
| `payments.ts` | `PaymentKind`, `paymentReference`, `recordPayment()` | The payment ledger's only writer, plus reference generation. |

### 2.1.5 `src/backend/db/`

| File | Key exports | What it does |
|---|---|---|
| `client.ts` | `prisma` | The Prisma singleton every database call goes through. |
| `tenant.ts` | `TenantClient`, `tenantClient()`, `Prisma` | The tenant-bound Prisma client — the first of two defences that stop one organisation reading another's rows. |
| `tx.ts` | `Tx`, `runInTransaction()`, `writeDenial()` | `ctx.tx` — the request-scoped transaction helper that makes "a write and its audit entry commit together" true; `writeDenial` records a refused attempt outside the rolled-back transaction. |
| `graph.ts` | `unitSubtree()`, `unitAncestors()`, `PositionRow`, `positionsInSubtree()`, `wouldCreateCycle()`, `lockSlot()`, `appliedMigrations()` | The only file allowed to use `$queryRaw` (lint-enforced) — recursive CTEs over the org graph, the reparent cycle check, and the booking row lock. |
| `preflight.ts` | `pendingMigrations()`, `warnOnPendingMigrations()` | Startup check that the database schema matches the migration folder. |

### 2.1.6 `src/backend/lib/`

| File | Key exports | What it does |
|---|---|---|
| `config.ts` | `Config`, `config`, `isProd`, `isDev`, `isTest` | Treats `process.env` as untrusted input — one Zod schema, parsed once at boot. |
| `errors.ts` | `AppError`, `ValidationError`, `ForbiddenError`, `WouldEscalateError`, `SignInRequiredError`, `NotAMemberError`, `NotFoundError`, `UnauthenticatedError`, `ConflictError` | The typed error classes; every one leaves through the error funnel and nowhere else. |
| `logger.ts` | `logDir`, `logToFile`, `createLogStreams()`, `loggerOptions`, `logger` | The single structured JSON logger, writing to more than one destination. |
| `logFile.ts` | `RotatingStreamOptions`, `RotatingStream`, `dateKey()`, `filePattern`, `createRotatingStream()` | Hand-rolled daily log-file rotation. |
| `logFormat.ts` | `levelName()`, `levelFromName()`, `localStamp()`, `parseStamp()`, `encodeValue()`, `decodeValue()`, `formatLogRecord()`, `TAIL_FIELD` | The on-disk log line format — encoding on write, decoding on read. |
| `paginate.ts` | `Paged<T>`, `CursorPoint`, `encodeCursor()`, `decodeCursor()`, `afterCursor`, `CURSOR_ORDER`, `afterCursorOn`, `orderOn`, `pageOf()` | Opaque-cursor pagination shared by every list route. |
| `mount.ts` | `mount()`, `mountPathOf`, `mountedRouters` | Mounts a router at a prefix and records it, so the route table can be introspected and tested. |
| `storage.ts` | `storageRoot`, `storage` | Where uploaded bytes live on disk. |
| `imageBytes.ts` | `ImageKind`, `ImageFacts`, `sniff()`, `stripMetadata()` | Determines what an uploaded image really is from its bytes, and strips metadata before storage. |
| `vocabulary.ts` | `nounsOf`, `counted` | The server's half of the vocabulary system — resolving nouns and counted phrases for server-rendered copy. |

### 2.1.7 `src/backend/middleware/` — the chain

| File | Key exports | What it does |
|---|---|---|
| `index.ts` | re-exports of the folder | Barrel, so `app.ts` reads as a plain list of link names. |
| `context.ts` | `Principal`, `AuditIntent`, `RequestContext`, `context` | Creates `req.ctx` — the one object the chain builds up and handlers never mutate. |
| `requestId.ts` | `requestId` | Link 1 — reads `X-Request-Id` or mints one, and echoes it back. |
| `requestLogger.ts` | `requestLogger` | Link 2 — structured log per request: method, path, status, duration, org, principal, request id. |
| `security.ts` | `consoleCors`, `publicCors`, `security` | Link 3 — helmet plus two distinct CORS policies (console versus public respondent surface). |
| `rateLimit.ts` | `globalRateLimit`, `scopedRateLimits`, `bucket` | Links 5 and 12 — one factory declaring the global bucket and every scoped bucket the same way. |
| `tenantResolver.ts` | `TenantResolverOptions`, `tenantResolver()` | Link 6 — resolves `orgId` for the request and attaches the tenant-bound database client. |
| `authenticate.ts` | `authenticateOptional`, `authenticate` | Link 7 — three principal kinds behind one middleware, so downstream links do not care which arrived. |
| `csrfProtection.ts` | `CSRF_COOKIE`, `issueCsrfToken()`, `csrfProtection` | Link 8 — the double-submit CSRF defence that cookie sessions make mandatory. |
| `validate.ts` | `validate` | Link 9 — the DTO pipe: parses params, query, and body against the shared Zod schemas. |
| `requireCapability.ts` | `CapabilityOptions`, `CAPABILITY_TAG`, `requireCapability` | Link 10 — the main guard. Resolves the target from the request and runs the GRANT resolver; authorisation is never decided in a handler. |
| `requireMembership.ts` | `requireMembership`, `memberOf()` | Link 10c — the respondent gate for token-addressed routes. |
| `requireNoEscalation.ts` | `RoleUnitPair`, `PairSource`, `ESCALATION_TAG`, `requireNoEscalation` | Link 10b — blocks assigning a role/unit pair that grants more than the caller holds. |
| `requireNoGrantEscalation.ts` | `GRANT_ESCALATION_TAG`, `requireNoGrantEscalation` | The same bound applied to powers-grid writes. |
| `requireEntitlement.ts` | `requireEntitlement` | Link 11 — the plan gate, deliberately separate from the capability gate so a 402 is distinguishable from a 403. |
| `requirePlatform.ts` | `PLATFORM_TAG`, `requirePlatformAuth`, `requirePlatform` | The fourth guard — operator authentication and platform capability checks for `/ops`. |
| `idempotency.ts` | `idempotent`, `sweepIdempotencyKeys()` | Link 13 — `Idempotency-Key` handling for unsafe writes, plus the key sweeper. |
| `auditWriter.ts` | `auditWriter` | Link 14 — the safety net that persists an audit intent if a handler did not. |
| `notFound.ts` | `notFound` | Link 15 — turns an unmatched route into a typed error, so no default Express HTML page ever ships. |
| `errorFunnel.ts` | `errorFunnel` | Link 16 — the single exit. Every error becomes one envelope shape here. |
| `chains.ts` | `tenantChain`, `authChain`, `respondentChain`, `activationChain`, `assetChain` | Links 6–8 packaged as router-level chains, one per kind of surface. |
| `upload.ts` | `UploadedFile`, `ImageUploadOptions`, `imageUpload()` | Link 4b — the one bypass of the JSON body parser, for multipart image uploads. |

### 2.1.8 `src/backend/platform/` — the `/ops` internals

| File | Key exports | What it does |
|---|---|---|
| `db.ts` | `PlatformSeamViolation`, `PlatformClient`, `platformClient()`, `Prisma` | The aggregate-only seam — operators can read counts and totals across the estate but never tenant row content; violations throw. |
| `session.ts` | `OPS_COOKIE`, `startSession()`, `endSession()`, `Operator`, `loadOperator()` | Operator sessions, separate from staff sessions. |
| `totp.ts` | `generateSecret()`, `codeAt()`, `currentCode`, `verifyCode()`, `otpauthUrl` | RFC 6238 TOTP implemented on `node:crypto`, with no dependency. |
| `audit.ts` | `writeAudit()` | The platform's own audit trail, distinct from any organisation's. |
| `logs/index.ts` | `LogFilters`, `LogReadResult`, `listLogFiles()`, `LogReadOptions`, `readLogFile()`, `EXPORT_MAX_LINES`, `LogExportOptions`, `LogExportResult`, `exportLogFile()` | Safe reading of the rotating log files — listing, filtered paging, and bounded export. |
| `logs/parser.ts` | `parseLogLine()` | Turns one raw `app-*.log` / `error-*.log` line into a structured `LogLine`. |

### 2.1.9 `src/backend/presets/`

| File | Key exports | What it does |
|---|---|---|
| `index.ts` | `PRESETS`, `PRESET_LIST`, `presetFor`, `presetView`, `estimateFor`, plus re-exports | The five presets as one lookup, and the view the setup wizard renders. |
| `types.ts` | `UnitSeed`, `TemplateSeed`, `Preset`, `rating`, `nps`, `yesno`, `text_`, `single`, `multi` | The preset shape plus tiny builders for each question kind used in seed templates. |
| `university.ts` | `university` | The university preset — units, roles, vocabulary, seed templates. |
| `hospital.ts` | `hospital` | The hospital preset. |
| `hotel.ts` | `hotel` | The hotel preset. |
| `company.ts` | `company` | The company preset. |
| `custom.ts` | `custom` | The blank/custom preset. |
| `grant-matrix.ts` | `Level`, `GRANT_MATRIX`, `GrantSeed`, `UNIVERSAL_SELF_GRANTS`, `levelForRole()`, `grantsForLevel()` | The seeded grant matrix — which role level gets which capability at which scope, plus the self-grants everybody gets. |

### 2.1.10 `src/backend/database/`

| File | Contains / does |
|---|---|
| `schema.prisma` | The whole data model — organisations, units, roles, grants, people, positions, memberships, templates, questions, campaigns, responses, answers, audit, sessions, files, bookings, announcements, payments, operators. |
| `migrations/migration_lock.toml` | Prisma's provider lock. |
| `migrations/20260818174024_init/` | Initial schema. |
| `migrations/20260818174500_sessions/` | Session table. |
| `migrations/20260819120000_campaign_status_derived/` | Campaign status becomes derived rather than stored. |
| `migrations/20260819120500_idempotency_keys/` | Idempotency key store. |
| `migrations/20260823170000_campaign_access/` | Campaign access mode. |
| `migrations/20260824090000_account_invites/` | Account invite tokens. |
| `migrations/20260824090500_users_disabled_at/` | Soft-disable for users. |
| `migrations/20260825100000_inbox_state/` | Inbox triage state. |
| `migrations/20260825170000_improve_loop/` | Reflections, gaps, plans, check-ins. |
| `migrations/20260825190000_audit_outcome/` | Outcome recorded on audit entries. |
| `migrations/20260826090000_platform_operators/` | Operator accounts and platform audit. |
| `migrations/20260829120000_payments/` | The payment ledger. |
| `migrations/20260830090000_announcements/` | Announcements and read receipts. |
| `migrations/20260830120000_booking/` | Bookables, slots, bookings. |
| `migrations/20260831090000_pending_tier/` | Scheduled downgrade / pending tier. |
| `migrations/20260831100000_notifications_and_enterprise/` | Platform messages and the Enterprise request queue. |
| `migrations/20260831140000_plan_lapse/` | Plan lapse handling. |

| Seed file | Key exports | What it does |
|---|---|---|
| `seed/index.ts` | — | Entry point: seeds presets, the library templates, and the four demo organisations. |
| `seed/demo.ts` | `DemoOrg`, `DEMO_ORGS`, `SeededLogin`, `seedOrg()` | The four demo organisations — structure, people, roles, grants, campaigns and responses. |
| `seed/comments.ts` | `Tone`, `COMMENT_POOLS`, `poolFor` | Pools of written comments used to make seeded free-text answers read realistically. |
| `seed/random.ts` | `Rng`, `skewedRating()`, `skewedNps()`, `skewedTimestamp()` | Deterministic pseudo-randomness so a reseed reproduces the same demo data. |
| `seed/operators.ts` | `OPERATOR_PASSWORD`, `seedOperators()` | The two platform operator accounts. |
| `seed/ops-code.ts` | — | Small CLI that prints the current TOTP code for each seeded operator. |
| `seed/contention.ts` | — | The booking contention demo — many concurrent bookers against one slot, exercising the row lock. |

### 2.1.11 `src/backend/features/`

Each feature folder holds a `router.ts` (route table plus its guards) and a `service.ts` (the
logic and database work); some add pure helper modules.

| File | Key exports | What it does |
|---|---|---|
| `auth/router.ts` | `authRouter` | Login, logout, register, `/me`, session refresh. |
| `auth/service.ts` | `register()` | Builds a working organisation in one transaction — org, root unit, Owner role, founder user and person, position, membership. |
| `accounts/router.ts` | `personAccountRouter`, `activationRouter` | Invite, reset, and revoke a person's account; the public activation endpoints. |
| `accounts/service.ts` | `provisionAccount()`, `revokeAccount()`, `inspectInvite()`, `Activation`, `activateAccount()` | Account provisioning, revocation, and token activation. |
| `accounts/status.ts` | `AccountFacts`, `accountStatusOf()` | Derives the four account states in one place. |
| `org/router.ts` | `orgRouter` | Read the organisation, update settings and labels, run the setup wizard commit, logo upload. |
| `org/service.ts` | `readOrg()`, `updateOrg()`, `updateLabels()`, `setupOrg()`, `bumpVersion()` | Organisation reads and the wizard's single commit. |
| `units/router.ts` | `unitsRouter` | Tree read, create, update, reparent, delete, impact and composition. |
| `units/service.ts` | `readTree()`, `createUnit()`, `updateUnit()`, `reparentUnit()`, `deleteUnit()`, `unitImpact()`, `unitComposition()`, `whereVisible` | The org graph's structural half, including cycle-safe reparenting and delete-impact analysis. |
| `roles/router.ts` | `rolesRouter`, `grantsRouter`, `authzRouter` | Role CRUD and reorder, powers-grid read/write, capability catalogue, permission simulation. |
| `roles/service.ts` | `listRoles()`, `createRole()`, `updateRole()`, `reorderRoles()`, `deleteRole()`, `readMatrix()`, `writeMatrix()`, `grantWarnings()`, `capabilityCatalogue`, `runSimulation()` | Roles and the powers grid, including the warnings shown before a risky grant write. |
| `people/router.ts` | `peopleRouter` | People CRUD, assignments, CSV preview and import, avatar upload. |
| `people/service.ts` | `listPeople()`, `readPerson()`, `createPerson()`, `updatePerson()`, `deletePerson()`, `addAssignment()`, `removeAssignment()`, `previewImport()`, `commitImport()` | People, positions, and the two-step CSV import. |
| `people/positions.ts` | `NameMaps`, `nameMaps()`, `resolveRow()`, `pairsFromImport()`, `pairsFromPerson()` | Resolves role and unit names to ids, shared by the import service and the escalation guard in front of it. |
| `people/powers.ts` | `powersByPlace()` | One implementation of "what can this person do, and where?". |
| `people/visibility.ts` | `personScopeFilter()`, `assertPersonVisible()`, `requirePersonVisible` | The row-level half of a person route's guard. |
| `subjects/router.ts` | `subjectsRouter` | Subject list, read, create, update, archive. |
| `subjects/service.ts` | `listSubjects()`, `readSubject()`, `createSubject()`, `updateSubject()`, `archiveSubject()` | Subject logic, scoped to what the caller can see. |
| `templates/router.ts` | `templatesRouter` | Library browse, template CRUD, clone, and question replacement. |
| `templates/service.ts` | `listLibrary()`, `listTemplates()`, `readTemplate()`, `createTemplate()`, `updateTemplate()`, `cloneTemplate()`, `putQuestions()`, `deleteTemplate()` | Templates and their questions. |
| `campaigns/router.ts` | `campaignsRouter` | Campaign list and detail, create, update, quick-create, launch, close, audience preview. |
| `campaigns/service.ts` | `listCampaigns()`, `readCampaign()`, `createCampaign()`, `updateCampaign()`, `quickCreate()`, `launchCampaign()`, `closeCampaign()`, `audiencePreview()` | Campaign lifecycle. |
| `campaigns/status.ts` | `StatusFacts`, `statusOf()`, `isAccepting`, `whereStatus()` | Campaign status derived on read from dates and flags, never stored stale. |
| `campaigns/audience.ts` | `countAudience()`, `ruleOf`, `positionFilter()`, `audienceUsers()` | Turns an audience rule into a count or a concrete user list. |
| `campaigns/token.ts` | `mintToken()`, `publicUrlFor` | The unguessable public campaign token and its URL. |
| `campaigns/visibility.ts` | `ORGANISATION_SUBJECT`, `scopeToCampaigns`, `campaignInScope` | Which campaigns a reader may see — one implementation used in three places. |
| `public/router.ts` | `publicRouter` | The respondent surface: read a campaign by token, submit a response, book a slot. |
| `public/resolve.ts` | `uniform404`, `LiveCampaign`, `resolveCampaign`, `campaignOf()`, `resolveBookable`, `bookableOf()` | Token resolution with a uniform 404, so a wrong token cannot be distinguished from a closed one. |
| `public/service.ts` | `readPublicCampaign()`, `submitResponse()`, `validateAnswersAgainstTemplate()` | The respondent path, including server-side answer validation against the template. |
| `results/router.ts` | `resultsRouter` | Aggregated results, raw responses, comments, CSV export. |
| `results/service.ts` | `readResults()`, `readResponses()`, `exportResults()`, `CommentRow`, `CommentFilter`, `readComments()`, `readableCampaigns()`, `CorpusFilter`, `Corpus`, `readCorpus()` | Results plus the k-anonymity gate that makes the anonymity promise real in SQL. |
| `analysis/router.ts` | `analysisRouter` | The analysis view and one theme's drill-through. |
| `analysis/service.ts` | `readAnalysis()`, `readTheme()` | Assembles the corpus and runs the engine. |
| `analysis/engine.ts` | `Valence`, `Document`, `Theme`, `EngineResult`, `stem()`, `tokenise()`, `scoreText()`, `EngineInput`, `analyse()` | The text-analysis engine — stemming, tokenising, sentiment scoring, theme extraction. No external service. |
| `analysis/lexicon.ts` | `STOP_WORDS`, `NEGATORS`, `NEGATION_WINDOW`, `SENTIMENT` | The engine's data — stop words, negators, and the sentiment lexicon. |
| `home/router.ts` | `homeRouter` | The console dashboard route. |
| `home/service.ts` | `readHome()`, `windowStart()` | Dashboard stats, prompts, and recent activity for a time window. |
| `inbox/router.ts` | `inboxRouter` | Response inbox and platform-message inbox routes. |
| `inbox/service.ts` | `readInbox()`, `mark()`, `readMessages()`, `markMessage()` | Triage of individual responses and of messages from the platform. |
| `improve/router.ts` | `reflectRouter`, `checkinsRouter` | The improve loop's routes, entitlement-gated. |
| `improve/service.ts` | `readCycles()`, `readForm()`, `submitReflection()`, `readGap()`, `createPlan()`, `finalisePlan()`, `createCheckin()`, `patchCheckin()` | Reflection cycles, the self-versus-others gap, plans, and check-ins. |
| `announcements/router.ts` | `announcementsRouter` | Announcement CRUD, publish, mark-read, audience preview. |
| `announcements/service.ts` | `listAnnouncements()`, `readAnnouncement()`, `createAnnouncement()`, `updateAnnouncement()`, `publishAnnouncement()`, `deleteAnnouncement()`, `markRead()`, `previewAudience()` | Announcements and their recipients. |
| `booking/router.ts` | `bookablesRouter`, `bookingsRouter` | Bookable CRUD, slot editing, open/close, bookings list and cancel. |
| `booking/service.ts` | `SlotFullError`, `bookingUrlFor`, `listBookables()`, `readBookable()`, `createBookable()`, `updateBookable()`, `putSlots()`, `openBookable()`, `closeBookable()`, `deleteBookable()`, `listBookings()`, `cancelBooking()`, `LiveBookable`, `resolveBookable()`, `readPublicBookable()`, `book()`, `cancelWithToken()` | Booking on both sides — console management and the public token flow, with a row lock so one slot cannot be double-booked. |
| `billing/router.ts` | `billingRouter` | The organisation's own plan routes. |
| `billing/service.ts` | `readBilling()`, `joinTier()`, `scheduleDowngrade()`, `cancelDowngrade()`, `requestEnterprise()`, `readEnterpriseRequest()` | Plan reads and changes, and the Enterprise request. |
| `audit/router.ts` | `auditRouter` | The activity log's single route. |
| `audit/service.ts` | `readAudit()` | Reads the organisation's activity log with its recorded decisions. |
| `profile/router.ts` | `profileRouter` | The signed-in user's own account, including avatar. |
| `profile/service.ts` | `readProfile()`, `updateProfile()`, `changePassword()` | The caller acting on themselves. |
| `files/router.ts` | `filesRouter` | Serves stored images. |
| `files/service.ts` | `FileView`, `FileKind`, `storeUpload()`, `discardFile()`, `urlFor`, `readFile()` | Storing and serving uploaded images. |
| `files/avatar.ts` | `setAvatar()`, `removeAvatar()` | Avatar writes. |
| `files/logo.ts` | `setLogo()`, `removeLogo()` | Organisation logo writes. |
| `platform/router.ts` | `platformRouter` | The whole `/ops` route tree — login, estate, org detail, plan override, suspend, message, audit, operators, analytics, earnings, logs, Enterprise queue. |
| `platform/service.ts` | `estate()`, `orgDetail()`, `stats()`, `analytics()`, `earnings()`, `overridePlan()`, `setSuspended()`, `messageAdministrators()`, `readPlatformAudit()`, `listOperators()`, `createOperator()`, `updateOperator()`, `listOperatorLogFiles()`, `logStoreMeta()`, `readOperatorLogFile()`, `exportOperatorLogFile()`, `readEnterpriseQueue()`, `updateEnterpriseRequest()`, `approveEnterpriseRequest()` | The estate as numbers, and every operator action — all through the aggregate-only seam. |

### 2.1.12 `src/backend/test/`

| File | What it covers |
|---|---|
| `globalSetup.ts` | One-time test database setup before the suite runs. |
| `setup.ts` | Per-file test setup and teardown. |
| `database.ts` | Test database helpers — reset, seed, connection. |
| `helpers.ts` | Shared request/actor helpers used by every test. |
| `chain.test.ts` | The middleware chain's order and behaviour. |
| `router-level.test.ts` | Router-level chains applied to each surface. |
| `routes.test.ts` | The mounted route table. |
| `validation.test.ts` | The DTO pipe and error envelope for bad input. |
| `logging.test.ts`, `log-format.test.ts` | Structured logging and on-disk log format. |
| `tenant.test.ts`, `cross-tenant-login.test.ts`, `test-database.test.ts` | Tenant isolation and test-database plumbing. |
| `me.test.ts` | The `/me` payload — session, org, labels, held capabilities. |
| `login-rate-limit.test.ts` | Login rate limiting. |
| `register-rollback.test.ts` | Registration rolls back fully on failure. |
| `escalation.test.ts`, `role-levels.test.ts`, `powers-grid.test.ts`, `roles.test.ts` | The escalation bound, role ladder, and powers-grid writes. |
| `simulator.test.ts` | The permission simulator's traces. |
| `org.test.ts`, `units.test.ts`, `unit-range.test.ts` | Organisation setup and the org graph, including range expansion. |
| `people.test.ts`, `person-anchor.test.ts`, `accounts.test.ts`, `profile.test.ts` | People, positions, account lifecycle, self-service profile. |
| `subjects.test.ts`, `templates.test.ts` | Subjects and templates. |
| `campaigns.test.ts`, `campaign-access.test.ts`, `public.test.ts`, `ordering.test.ts` | Campaign lifecycle, access modes, the respondent path, question ordering. |
| `results.test.ts`, `quick-results.test.ts`, `inbox.test.ts` | Results, the k-anonymity gate, quick campaigns, and inbox triage. |
| `analysis.test.ts` | The analysis engine and its API. |
| `improve.test.ts` | The improve loop. |
| `announcements.test.ts`, `booking.test.ts` | Announcements and booking, including slot contention. |
| `home.test.ts` | The dashboard payload. |
| `audit.test.ts` | The activity log and recorded decisions. |
| `tiers.test.ts`, `payments.test.ts`, `downgrade.test.ts`, `lapse.test.ts`, `enterprise.test.ts` | Entitlements, the payment ledger, scheduled downgrades, plan lapse, Enterprise requests. |
| `platform.test.ts`, `platform-logs.test.ts` | The `/ops` surface and its log reader. |
| `upload.test.ts` | Image upload, sniffing, and metadata stripping. |
| `seed.test.ts` | The seed programs produce a coherent database. |
| `vocabularies.test.ts`, `vocabulary-server.test.ts` | Label resolution on both sides. |

---

## 2.2 `src/frontend/`

| Sub-folder | Contains |
|---|---|
| *(root files)* | SPA entry (`main.tsx`), `App.tsx`, `index.html`, package and TS configs. |
| `design-system/` | The CSS layer — tokens, base styles, and the organic/ambient layer. |
| `store/` | The Redux store and its slices (auth, vocabulary, ops). |
| `router/` | Route tree, per-world layouts, guards, and error boundaries. |
| `lib/` | One module per feature — the data hooks that talk to the API, plus pure helpers. This is where server state lives in P1–P2. |
| `components/` | Shared components, grouped by kind: layout, data, form, org, feedback, flow, billing, platform, illustrations. |
| `pages/` | Screens, grouped by world: `public/`, `console/`, `respond/`, `platform/`. |
| `public/` | Static assets served as-is (self-hosted fonts). |
| `dist-types/`, `dist-config/` | Generated build output. Not source. |

### 2.2.1 `src/frontend/` — root files

| File | Key exports | What it does |
|---|---|---|
| `main.tsx` | — | SPA entry — one mount, one router, no full page loads after this point. |
| `App.tsx` | `App()` | Wires the store provider and the router; the three worlds are defined in `router/`. |
| `index.html` | — | Vite's HTML entry. |
| `package.json` | — | Frontend scripts and dependencies. |
| `tsconfig.json`, `tsconfig.node.json` | — | Frontend TypeScript configs. |

### 2.2.2 `src/frontend/design-system/`

| File | What it does |
|---|---|
| `tokens.css` | The design tokens — colour, type scale, spacing, radii, shadows, for light and dark. |
| `endur.css` | The base and component styles built on those tokens. |
| `organic.css` | The ambient/organic visual layer used behind public and console chrome. |

### 2.2.3 `src/frontend/store/`

| File | Key exports | What it does |
|---|---|---|
| `index.ts` | `store`, `RootState`, `AppDispatch`, `useAppDispatch`, `useAppSelector` | The whole store plus typed hooks. Server data deliberately does not live here in P1–P2. |
| `authSlice.ts` | `SessionStatus`, `AuthState`, `signedIn`, `signedOut`, `authReducer` | Staff session state. |
| `vocabularySlice.ts` | `VocabularyState`, `labelsLoaded`, `labelsCleared`, `vocabularyReducer` | The resolved labels for the current organisation. |
| `opsSlice.ts` | `OpsStatus`, `OpsState`, `opsSignedIn`, `opsSignedOut`, `opsReducer` | Operator session state for `/ops`. |

### 2.2.4 `src/frontend/router/`

| File | Key exports | What it does |
|---|---|---|
| `index.tsx` | `routes`, `router` | The three route trees — public, console, respond — plus the operator tree. |
| `layouts.tsx` | `PublicLayout()`, `ConsoleLayout()`, `OpsLayout()`, `RespondLayout()` | One layout per world; the console layout carries the app shell. |
| `guards.tsx` | `SessionLoading()`, `RedirectIfSignedIn()`, `RequireSession()`, `RequireCapability()`, `RequirePlatformAuth()` | Route guards for session, capability, and operator authentication. |
| `boundaries.tsx` | `PublicBoundary()`, `ConsoleBoundary()`, `OpsBoundary()`, `RespondBoundary()` | Four error boundaries, one per world, each with its own recovery copy. |
| `routes.test.tsx`, `guards.test.tsx`, `boundaries.test.tsx` | — | Tests for the route tree, guards, and boundaries. |

### 2.2.5 `src/frontend/lib/` — data hooks and pure helpers

| File | Key exports | What it does |
|---|---|---|
| `api.ts` | `ApiError`, `SessionExpiredError`, `setUnauthenticatedHandler()`, `apiGet`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`, `apiUpload()` | The one way the client talks to the server — CSRF header, error envelope decoding, session-expiry handling. |
| `session.ts` | `useBootSession()`, `switchToDemoOrg()`, `signOut()` | Boot: loads `/me` into the store, plus demo-org switching and sign-out. |
| `auth.ts` | `useRefreshSession()`, `useSignIn()`, `useActivate()`, `useRegister()` | The two ways into the console, plus activation and registration. |
| `capabilities.ts` | `Can`, `useCan()` | Capability-aware UI — asks the held-capability set returned by the API. |
| `labels.ts` | `useLabels`, `useLabel()`, `useLabelPlural()` | Three lines that make every domain noun in the UI data-driven. |
| `validate.ts` | `FieldErrors`, `fieldErrorsOf()`, `isValid`, `FormValidation`, `useFormValidation()` | Client-side field validation from the same Zod schemas the server uses. |
| `format.ts` | `formatDate`, `formatDateTime`, `formatRelative()`, `pluralise`, `minutes`, `approxDuration()`, `derivePlural()` | Presentation-only helpers; none of them knows a domain noun. |
| `theme.ts` | `ThemeChoice`, `ResolvedTheme`, `readChoice()`, `systemTheme()`, `resolve()`, `apply()`, `persist()`, `applyWithTransition()` | Light/dark resolution, persistence, and the animated transition. |
| `demo.ts` | `DemoOrg`, `DEMO_ORGS`, `isDemoBuild` | The demo-org affordance shown on sign-in. |
| `tree.ts` | `flattenUnits()` | Pure helper that flattens the unit tree for pickers and filters. |
| `unitTotals.ts` | `CountedNode`, `Totals`, `NO_TOTALS`, `branchOf()`, `ownOf()`, `forestTotals()` | Defines what a number printed on a unit means — own versus whole branch. |
| `org.ts` | `Loadable<T>`, `usePresets()`, `useSetupOrg()`, `useOrg()`, `useUpdateOrg()`, `useUpdateLabels()`, `useUploadLogo()`, `useRemoveLogo()` | Organisation reads, the wizard's single write, settings and logo. |
| `units.ts` | `UnitsController`, `useUnits()`, `useUnitComposition()`, `unitImpact` | The unit tree's reads and writes. |
| `roles.ts` | `useRoles()`, `RoleLadderController`, `useRoleLadder()`, `CellKey`, `cellKey`, `choiceOf`, `GridState`, `GridController`, `usePowersGrid()` | Roles and the powers grid, including local grid state before a save. |
| `people.ts` | `usePeopleIn()`, `usePeopleSearch()`, `PeopleQuery`, `PeopleListController`, `peopleSearch()`, `usePeopleList()`, `PersonController`, `usePerson()` | People list, search, and one person's detail with writes. |
| `accounts.ts` | `inviteAccount`, `resetAccount`, `revokeAccount`, `useActivationPreview()`, `activate` | Account provisioning and the public activation screen's data. |
| `profile.ts` | `ProfileController`, `useProfile()` | The caller's own account. |
| `subjects.ts` | `SubjectQuery`, `SubjectListController`, `subjectSearch()`, `useSubjectList()`, `useSubject()` | Subjects — list, filters, detail, writes. |
| `templates.ts` | `LibraryFilters`, `librarySearch()`, `useTemplateLibrary()`, `TemplateListController`, `useTemplates()`, `useTemplate()`, `cloneKey()` | The template library and one template's detail and writes. |
| `campaigns.ts` | `CampaignQuery`, `campaignSearch()`, `CampaignListController`, `useCampaignList()`, `CampaignController`, `useCampaign()`, `useAudiencePreview()`, `launchCampaign()`, `launchKey()`, `quickCreate()` | Campaign reads and writes, audience preview, and the idempotent launch. |
| `results.ts` | `POLL_MS`, `resultsSearch()`, `ResultsController`, `useResults()`, `ResponsesController`, `useResponses()`, `ExportResult`, `fetchExport()`, `saveCsv()` | Results reads with polling, plus CSV export and download. |
| `analysis.ts` | `Upgrade`, `analysisSearch()`, `AnalysisController`, `useAnalysis()`, `ThemeController`, `useThemeDetail()` | The analysis view and its drill-through, including the plan-gated upgrade state. |
| `inbox.ts` | `MarkAction`, `InboxController`, `inboxSearch()`, `useInbox()`, `MessagesController`, `useMessages()` | Response triage and platform messages. |
| `home.ts` | `HomeController`, `useHome()` | The console dashboard. |
| `reflect.ts` | `Gated<T>`, `useCycles`, `useReflectionForm`, `useGap`, `submitReflection`, `savePlan`, `finalisePlan` | The improve loop, with the entitlement gate expressed in the type. |
| `announcements.ts` | `AnnouncementController`, `useAnnouncements()`, `createAnnouncement`, `updateAnnouncement`, `publishAnnouncement`, `publishKey`, `deleteAnnouncement`, `markAnnouncementRead`, `useRecipientPreview()` | Announcements and their recipient preview. |
| `booking.ts` | `BookablesController`, `useBookables()`, `useBookable()`, `createBookable`, `updateBookable`, `putSlots`, `openBookable`, `openKey`, `closeBookable`, `deleteBookable`, `cancelBooking`, `PublicBookableState`, `usePublicBookable()`, `takeSlot`, `bookKey`, `cancelWithToken`, `rememberBooking()`, `rememberedBooking()`, `forgetBooking()` | Booking on both sides, including remembering a respondent's cancel token locally. |
| `respond.ts` | `CampaignGate`, `PublicCampaignState`, `usePublicCampaign()`, `SubmitResult`, `submitResponse()`, `submitKey()`, `hasResponded()`, `markResponded()`, `DoneState` | The respondent seam — load by token, submit once, remember that it was submitted. |
| `billing.ts` | `useBilling()`, `usePlans()`, `useJoinTier()`, `useScheduleDowngrade()`, `useCancelDowngrade()`, `useEnterpriseRequest()` | The organisation's plan, as the console reads and changes it. |
| `audit.ts` | `AuditFilters`, `AuditController`, `auditSearch()`, `useAudit()` | The activity log with filters. |
| `simulator.ts` | `useCapabilityCatalogue()`, `SimulationRecord`, `SimulatorController`, `useSimulator()` | The permission simulator's reads and its one write. |
| `ops.ts` | `OpsError`, `setOpsUnauthenticatedHandler()`, `opsGet`, `opsPost`, `opsPatch`, `opsDownload()` | The `/ops` API client, separate from the tenant client. |
| `opsSession.ts` | `useBootOpsSession()` | Boots the operator session into the store. |
| `opsCapabilities.ts` | `OpsCan`, `useOpsCan()` | Capability-aware operator UI — the mirror of `capabilities.ts`. |
| `estate.ts` | `Loadable<T>`, `EstateFilters`, `EstateController`, `estateSearch()`, `useEstate()`, `useOrgDetail()`, `useEnterpriseQueue()` | The estate list, one organisation, and the Enterprise queue. |
| `analytics-ops.ts` | `AnalyticsWindow`, `analyticsSearch()`, `useAnalytics()` | Platform analytics, with window and granularity kept in the URL. |
| `earnings.ts` | `EarningsWindow`, `useEarnings()` | Platform earnings, reusing the analytics query builder. |
| `oplogs.ts` | `LogFilter`, `useLogExport()`, `useLogFiles()`, `LogLinesController`, `useLogLines()` | Browsing and exporting the rotating log files from `/ops`. |
| `api.test.ts`, `capabilities.test.tsx`, `labels.test.tsx`, `format.test.ts`, `home.test.ts`, `results.test.ts`, `respond.test.ts`, `templates.test.ts` | — | Tests for the client, capability and label hooks, formatting, and the corresponding feature modules. |

### 2.2.6 `src/frontend/components/`

| File | Key exports | What it does |
|---|---|---|
| `Icon.tsx` | `IconName`, `IconSize`, `Icon()` | The closed icon vocabulary — no arbitrary icons. |
| `ThemeToggle.tsx` | `ThemeToggle()` | The appearance control (system / light / dark). |
| `AmbientBackground.tsx` | `AmbientBackground()` | The ambient visual layer behind public and console chrome. |
| `layout/AppShell.tsx` | `AppShell()` | Top bar plus sidebar plus content well — console world only. |
| `layout/TopBar.tsx` | `TopBar()` | The top bar, carrying org switching, search, theme, and account. |
| `layout/Sidebar.tsx` | `Sidebar()` | The grouped navigation rail. |
| `layout/navItems.ts` | `NavGroup`, `NavItem`, `GROUP_LABELS`, `navItems()` | The sidebar's items, their grouping, order, and capability requirements. |
| `layout/PageHeader.tsx` | `FilterChip`, `ScopeChip`, `PageHeader()` | The header every console page opens with, which is what makes differently shaped screens feel like one product. |
| `layout/VocabularyChips.tsx` | `VocabularyChips()` | The vocabulary chips under the page title — the visible sign that nouns are data. |
| `data/BarRow.tsx` | `BarRowProps`, `BarRow()` | One labelled horizontal bar — the workhorse of every result view. |
| `data/StackedBar.tsx` | `StackedBar()` | A distribution as one stacked bar. |
| `data/GapBar.tsx` | `GapBar()` | Self-versus-others gap, drawn as a diverging bar. |
| `data/TrendLine.tsx` | `TrendSeries`, `TrendLine()` | A small line chart, used for sentiment over time. |
| `data/TrendChip.tsx` | `TrendChip()` | A compact up/down delta chip. |
| `data/ScoreBadge.tsx` | `ScoreBadge()` | A single score, with its band. |
| `data/StatCard.tsx` | `StatCard()` | One dashboard statistic with label and optional trend. |
| `data/ThemeTable.tsx` | `ThemeTable()` | The analysis themes table. |
| `data/ResponsiveTable.tsx` | `Column<T>`, `ResponsiveTable<T>()` | A generic table that becomes stacked cards on narrow screens. |
| `data/SlotGrid.tsx` | `SlotViewish`, `SlotGridProps`, `groupByDay()`, `remainingLabel()`, `SlotGrid()` | Booking slots, rendered the same way on both sides of the product. |
| `form/QuestionInput.tsx` | `Question`, `QuestionInput()`, `RatingInput()`, `NpsInput()`, `SingleChoiceInput()`, `MultiChoiceInput()`, `YesNoInput()`, `TextInput()` | The six answer inputs a respondent uses. |
| `form/QuestionEditor.tsx` | `QuestionEditor()`, `RatingEditor()`, `NpsEditor()`, `YesNoEditor()`, `SingleChoiceEditor()`, `MultiChoiceEditor()`, `TextEditor()` | The six per-type editors in the form builder. |
| `form/QuestionCard.tsx` | `QuestionCard()` | One question in the builder — drag handle, type, required flag, actions. |
| `form/kinds.ts` | `QuestionDraft`, `KIND_LABELS`, `KIND_GROUPS`, `optionsOf`, `defaultConfig()`, `KindChange`, `changeKind()` | Changing a question's type, including what is preserved and what is lost. |
| `form/FormPreview.tsx` | `PREVIEW_WIDTHS`, `PreviewWidth`, `FormPreview()` | The form as a respondent would see it, at three widths. |
| `form/FileUpload.tsx` | `FileUpload()` | Image picker with client-side validation. |
| `form/Toggle.tsx` | `Toggle()` | A labelled toggle; the label is required. |
| `org/UnitTree.tsx` | `UnitTreeNode`, `UnitTreeMode`, `UnitTreeRequest`, `daysUntil()`, `UnitTree()` | The org tree as an interactive control — select, expand, rename, reparent. |
| `org/UnitMap.tsx` | `UnitMap()` | The organisation drawn as the graph it actually is. |
| `org/RoleRow.tsx` | `seesText()`, `RoleRow()` | One role in the ladder, with a plain-English summary of what it sees. |
| `org/PowersByPlace.tsx` | `PowersByPlace()` | "What can this person do, and where?" — one implementation, two placements. |
| `org/DecisionTrace.tsx` | `Trace`, `DecisionTrace()` | Renders an authorisation decision as a readable trace. |
| `org/WordsEditor.tsx` | `WordsEditor()` | The vocabulary fields plus the live preview that is the point of the step. |
| `org/InlineName.tsx` | `InlineName()` | Inline rename with optimistic display and error revert. |
| `org/AnnouncementBanner.tsx` | `AnnouncementBanner()`, `unreadFor` | The unread announcement banner in the console. |
| `org/DashboardPreview.tsx` | `DashboardPreview()` | A small illustrative dashboard used in marketing and setup surfaces. |
| `feedback/Toast.tsx` | `Toast()` | Transient confirmation messages. |
| `feedback/ConfirmDialog.tsx` | `ConfirmDialog()` | Confirmation with a stated consequence. |
| `feedback/EmptyState.tsx` | `EmptyState()` | Empty states with their copy rules. |
| `feedback/ResponseCard.tsx` | `ResponseCard()` | One response in the inbox. |
| `feedback/MessageCard.tsx` | `MessageCard()` | One message from the platform. |
| `feedback/InviteLink.tsx` | `InviteLink()` | The activation link, with copy affordance. |
| `feedback/ShareSheet.tsx` | `isUnscannable()`, `ShareSheet()` | Sharing a campaign — link, QR code, and the check that the QR is scannable. |
| `flow/ProgressRail.tsx` | `RailStep`, `ProgressRail()` | The step rail used by the setup wizard and multi-step flows. |
| `billing/PlanPicker.tsx` | `PlanPickerMode`, `PlanPicker()` | The plan ladder, in signup and in-console modes. |
| `billing/PaymentDialog.tsx` | `PaymentDialog()` | The payment step for a plan change. |
| `billing/PlanNoticeBanner.tsx` | `NOTICE_WINDOW_DAYS`, `daysUntil()`, `noticeFor()`, `PlanNoticeBanner()` | The banner for a plan about to run out, or one that already did. |
| `billing/UpgradeCard.tsx` | `UpgradeCard()` | The 402 state, rendered on whichever surface hit it. |
| `billing/EnterpriseRequestDialog.tsx` | `EnterpriseRequestDialog()` | Asking for an Enterprise plan. |
| `platform/OrgRow.tsx` | `OrgRow()`, `OrgChip`, `orgChips()` | One organisation in the estate list, with its status chips. |
| `platform/EnterpriseQueue.tsx` | `EnterpriseQueue()` | The operator's Enterprise request queue. |
| `platform/MessageComposer.tsx` | `MessageComposer()` | Contacting an organisation's administrators. |
| `platform/GrowthChart.tsx` | `GrowthChartPoint`, `GrowthChart()` | Organisations over time. |
| `platform/RevenueChart.tsx` | `RevenuePoint`, `RevenueChart()` | Revenue taken per period. |
| `platform/TierDonut.tsx` | `TierSlice`, `TierDonut()` | The current plan mix. |
| `platform/TierTrendChart.tsx` | `TierTrendPoint`, `TierTrendChart()` | Which plans are being bought, over time. |
| `platform/LogViewer.tsx` | `LogViewer()` | The log line viewer used by `/ops/logs`. |
| `illustrations/Illustration.tsx` | `IllustrationName`, `Illustration()` | The closed illustration set. |
| `illustrations/*.svg` | — | The artwork itself: `hero-university`, `hero-hotel`, `hero-hospital`, `hero-company`, `claim-anonymity`, `claim-grants`. |
| `ThemeToggle.test.tsx`, `data/charts.test.tsx`, `data/ResponsiveTable.test.tsx`, `data/SlotGrid.test.tsx`, `layout/PageHeader.test.tsx`, `layout/TopBar.test.tsx`, `layout/Sidebar.test.tsx`, `form/QuestionCard.test.tsx`, `form/QuestionInput.test.tsx`, `form/QuestionEditor.test.tsx`, `form/kinds.test.ts`, `form/FileUpload.test.tsx`, `org/UnitTree.test.tsx`, `org/UnitMap.test.tsx`, `org/PowersByPlace.test.tsx`, `org/InlineName.test.tsx`, `feedback/Toast.test.tsx`, `feedback/ShareSheet.test.tsx`, `billing/PlanPicker.test.tsx`, `billing/PlanNoticeBanner.test.tsx` | — | Component tests for the above. |

### 2.2.7 `src/frontend/pages/` — public world

| File | Key exports | What it does |
|---|---|---|
| `Placeholder.tsx` | `Placeholder()` | Stand-in component so every route resolves to something real. |
| `public/Landing.tsx` | `Landing()` | The marketing landing page. |
| `public/Login.tsx` | `Login()` | Sign in, including the multi-org disambiguation case. |
| `public/Start.tsx` | `Start()` | Create an organisation — the registration flow with plan choice. |
| `public/Activate.tsx` | `Activate()` | Activate an invited account from a token. |
| `public/AuthAside.tsx` | `AuthAside()` | The column beside the sign-in and create forms. |
| `public/Landing.test.tsx`, `public/Login.test.tsx`, `public/Start.test.tsx` | — | Tests for the public screens. |

### 2.2.8 `src/frontend/pages/console/`

| Folder / file | Key exports | What it does |
|---|---|---|
| `Home/index.tsx` | `Home()` | `/app` — the dashboard. |
| `Home/cards.ts` | `Stat`, `RANGE_LABEL`, `statCards()`, `Prompt`, `promptCopy()`, `endsIn()` | The dashboard's stat cards and prompt copy, as pure functions. |
| `Home/CampaignCard.tsx` | `CampaignCard()` | One collecting campaign on the dashboard. |
| `Home/Recent.tsx` | `Recent()` | The recent-response strip. |
| `Start/index.tsx` | `tierReaches`, `laneState()`, `Start()` | `/app/start` — the gallery that makes five surfaces read as one product. |
| `Start/StartCard.tsx` | `StartState`, `StartCardProps`, `StartCard()` | One lane of that gallery. |
| `Setup/index.tsx` | `Setup()` | The setup wizard shell. |
| `Setup/useWizard.ts` | `RoleDraft`, `UnitDraft`, `WizardState`, `STEPS`, `StepKey`, `stepIndex`, `hasEdits`, `toTree()`, `depthOf()`, `useWizard()`, `labelsForWire` | The wizard's whole state in one object, plus the shape sent on commit. |
| `Setup/steps/Industry.tsx` | `IndustryStep()` | Step 1 — pick an industry preset. |
| `Setup/steps/Roles.tsx` | `RolesStep()` | Step 2 — the role ladder. |
| `Setup/steps/Structure.tsx` | `StructureStep()` | Step 3 — the unit tree. |
| `Setup/steps/Words.tsx` | `WordsStep()` | Step 4 — the vocabulary, with the live preview that is the point of the step. |
| `Setup/steps/Review.tsx` | `ReviewStep()` | Step 5 — review, then one commit. |
| `Structure/index.tsx` | `Structure()` | `/app/structure` — the org graph screen. |
| `Structure/Overview.tsx` | `Overview()` | The band above the map: four counts and the tree's shape. |
| `Structure/DetailPanel.tsx` | `DetailPanel()` | The right half — the selected unit's detail and actions. |
| `Structure/consequence.ts` | `Own`, `deleteConsequence()`, `checkingConsequence`, `unknownConsequence` | The delete sentence, as a pure function. |
| `People/index.tsx` | `People()` | `/app/people` — the people list, filters, and bulk actions. |
| `People/PersonDetail.tsx` | `PersonDetail()` | `/app/people/:id` — one person, positions, powers, account. |
| `People/PersonForm.tsx` | `PersonDraft`, `PersonForm()` | Add or edit a person. |
| `People/PositionEditor.tsx` | `PositionDraft`, `PositionEditor()`, `PositionChip()` | Assigning a role at a unit, as two inline dropdowns. |
| `People/ImportWizard.tsx` | `ImportWizard()` | CSV import — paste, preview, resolve problems, commit. |
| `Roles/index.tsx` | `Roles()` | `/app/roles` — the roles screen with its two tabs. |
| `Roles/RoleLadder.tsx` | `RoleLadder()` | The role ladder tab. |
| `Roles/PowersGrid.tsx` | `PowersGrid()` | The powers grid, written in plain language rather than capability ids. |
| `Subjects/index.tsx` | `Subjects()`, `archiveConsequence()` | `/app/subjects` — the subject list. |
| `Subjects/Detail.tsx` | `trendOf()`, `SubjectDetail()` | `/app/subjects/:id` — one subject and its cycles. |
| `Subjects/SubjectForm.tsx` | `SubjectDraft`, `SubjectForm()` | Create or edit a subject. |
| `Templates/index.tsx` | `Templates()` | `/app/templates` — the library grid. |
| `Templates/Detail.tsx` | `TemplateDetail()` | `/app/templates/:id` — one template. |
| `Templates/TemplateCard.tsx` | `TemplateCard()` | One card in the library grid. |
| `Templates/TemplatePreview.tsx` | `TemplatePreview()` | A drawing of the form at a glance. |
| `Templates/PreviewDialog.tsx` | `PreviewDialog()` | Quick look at a template without leaving the library. |
| `Templates/BlankFormDialog.tsx` | `BlankFormDialog()` | The blank-form escape hatch. |
| `Templates/consequence.ts` | `DeleteVerdict`, `deleteConsequence()` | The template delete sentence, as a pure function. |
| `Builder/index.tsx` | `Builder()` | `/app/forms/:id/build` — the form builder. |
| `Builder/useBuilder.ts` | `SaveState`, `Draft`, `Builder`, `useBuilder()` | The builder's draft state and its autosave. |
| `Builder/Preview.tsx` | `BuilderPreview()` | `/app/forms/:id/preview`. |
| `Builder/SaveIndicator.tsx` | `SaveIndicator()` | The autosave indicator. |
| `Campaigns/index.tsx` | `Campaigns()`, `STATUS_TAG`, `QUICK_CATEGORIES`, `suppressionNote()`, `timing()` | `/app/campaigns` — the campaign list. |
| `Campaigns/New.tsx` | `autoName()`, `CampaignNew()` | `/app/campaigns/new` — the creation flow. |
| `Campaigns/Detail.tsx` | `CampaignDetail()` | `/app/campaigns/:id` — one campaign, its share sheet and controls. |
| `Campaigns/QuickDialog.tsx` | `COPY`, `QuickDialog()` | A poll or suggestion box in one dialog and one call. |
| `Campaigns/summary.ts` | `SummaryInput`, `Summary`, `summarise()` | The creation summary card, as a pure function. |
| `Campaigns/summary-close.ts` | `closeConsequence()` | The close sentence. |
| `Results/index.tsx` | `Results()` | `/app/campaigns/:id/results`. |
| `Results/QuestionResult.tsx` | `QuestionResult()` | One question's numbers. |
| `Results/Comments.tsx` | `Comments()` | What people actually wrote. |
| `Results/stats.ts` | `Stat`, `ratingAverage()`, `commentCount`, `statCards()`, `newSince` | The four result stat cards, as pure functions. |
| `Analysis/index.tsx` | `Analysis()` | `/app/analysis` — themes, sentiment, drivers, confidence. |
| `Analysis/Sentiment.tsx` | `Sentiment()` | The sentiment donut. |
| `Analysis/Drivers.tsx` | `Driver`, `Drivers()` | Key drivers. |
| `Analysis/ThemePanel.tsx` | `ThemePanel()` | The theme drill-through. |
| `Analysis/Confidence.tsx` | `ConfidenceTag()`, `ReliabilityStrip()` | Reliability of the analysis — the differentiator, not decoration. |
| `Inbox/index.tsx` | `Inbox()` | `/app/inbox` — response triage and platform messages. |
| `Reflect/index.tsx` | `Reflect()` | `/app/reflect` — the improve loop. |
| `Announcements/index.tsx` | `readLine()`, `Announcements()` | `/app/announcements` — the list and its read state. |
| `Announcements/Composer.tsx` | `Composer()` | Writing an announcement, with audience preview. |
| `Booking/index.tsx` | `stateLine()`, `Booking()` | `/app/booking` — the list of bookable things. |
| `Booking/Detail.tsx` | `toLocalInput()`, `BookingDetail()` | `/app/booking/:id` — the slot editor, bookings table, and QR code. |
| `Logs/index.tsx` | `Logs()` | `/app/logs` — the organisation's activity log. |
| `Plan/index.tsx` | `Plan()` | `/app/plan` — the organisation's plan and how to change it. |
| `Profile/index.tsx` | `Profile()` | `/app/profile` — the signed-in user's own account. |
| `Profile/PasswordCard.tsx` | `PasswordCard()` | Change your own password. |
| `Settings.tsx` | `Settings()` | `/app/settings` — organisation settings, labels, logo. |
| `Simulator.tsx` | `Simulator()` | `/app/simulator` — ask why a permission would be allowed or denied. |
| `*.test.tsx` / `*.test.ts` in each folder | — | Screen and pure-helper tests: `Home`, `Start`, `Setup`/`useWizard`, `Structure`/`consequence`, `People`/`PersonDetail`, `Roles`, `Subjects`/`Detail`, `Templates`/`Detail`/`consequence`, `Builder`/`useBuilder`, `Campaigns`/`New`/`summary`, `Results`/`stats`, `Analysis`, `Inbox`, `Reflect`, `Announcements`, `Logs`, `Plan`, `Profile`, `Settings`. |

### 2.2.9 `src/frontend/pages/respond/` — the respondent world

| File | Key exports | What it does |
|---|---|---|
| `Fill.tsx` | `Fill()` | `/r/:token` — the hero screen where a respondent answers. |
| `Done.tsx` | `Done()` | `/r/:token/done` — the thank-you screen. |
| `Unavailable.tsx` | `Unavailable()` | The dead ends — closed, not found, already answered. |
| `Book.tsx` | `Book()` | `/book/:token` — the public slot picker. |
| `answers.ts` | `Answers`, `isAnswered()`, `answeredCount`, `missingRequired`, `remainingLabel()`, `toSubmitAnswers` | The form's state maths, as pure functions. |
| `copy.ts` | `costLine()`, `anonymityLine`, `accessNotice()`, `thanksLine()`, `respondedLine()` | The few sentences a respondent actually reads. |
| `Fill.test.tsx`, `Done.test.tsx`, `answers.test.ts`, `copy.test.ts`, `bundle.test.ts` | — | Tests for the respondent path, including a bundle-size check on this world. |

### 2.2.10 `src/frontend/pages/platform/` — the operator world (`/ops`)

| File | Key exports | What it does |
|---|---|---|
| `Login.tsx` | `Login()` | `/ops/login` — operator sign-in with TOTP. |
| `Console/index.tsx` | `Console()` | `/ops` — the estate list, the default view. |
| `Console/OrgDetail.tsx` | `OrgDetail()` | `/ops/orgs/:id` — one organisation: plan override, suspend, message its administrators. |
| `Analytics/index.tsx` | `Analytics()` | `/ops/analytics` — the whole estate at once. |
| `Earnings/index.tsx` | `Earnings()` | `/ops/earnings` — what the estate has paid. |
| `Logs/index.tsx` | `Logs()` | `/ops/logs` — the rotating log files, browsable and exportable. |
| `Console/OrgDetail.test.tsx` | — | Test for the org detail screen. |

### 2.2.11 `src/frontend/public/` and generated output

| Path | What it is |
|---|---|
| `public/fonts/inter-latin.woff2`, `inter-latin-ext.woff2`, `outfit-latin.woff2`, `outfit-latin-ext.woff2` | Self-hosted webfonts, so no third-party font request is made. |
| `public/fonts/README.md` | Notes on where the fonts came from and how subsets were generated. |
| `dist-types/`, `dist-config/` | Generated declaration and config build output mirroring `lib/` and `store/`. Not source; safe to delete and rebuild. |

---

## How the pieces fit

1. A request arrives at `src/backend/app.ts` and walks the chain in `middleware/` — id, logging,
   security, parsing, rate limit, tenant resolution, authentication, CSRF, then `validate` against
   a Zod schema from `packages/shared/src/dto/`.
2. `requireCapability` calls the resolver in `authz/`, which collects candidate grants, matches
   scope, and returns a decision where an explicit deny always wins. No handler decides access.
3. The feature's `service.ts` does the work inside `runInTransaction`, writing its audit intent in
   the same transaction as the change.
4. The response leaves as a DTO the frontend already has the type for; any error leaves through
   the single `errorFunnel` as one envelope shape.
5. In the browser, a `lib/*.ts` hook fetches through `lib/api.ts`, a page under `pages/` renders it
   with components from `components/`, and every domain noun on screen comes from `useLabels()`.
