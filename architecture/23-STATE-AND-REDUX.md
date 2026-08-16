# 23 — State and Redux

Phase: P1–P2 thin · **P3 is the graded phase** · Owns: `apps/web/src/store/**`
Decisions: `_MEMORY.md` DEC-008 · Open: **OPEN-001 — the P3 shape is not decided**

---

## 1. Status

Redux is a **Phase-3 evaluation criterion**, roughly three months out. It appears nowhere in
`design_specs` (CONF-005). The shape has not been chosen, and this document does not pretend
otherwise — §4 lays out the options and a recommendation, marked undecided.

What **is** decided (DEC-008): the store exists from P1, and it stays thin until P3, so that
P3 is **additive rather than a rewrite**.

## 2. P1–P2: two slices, and no more

```
apps/web/src/store/
  index.ts          configureStore, typed hooks
  authSlice.ts      { status, user, org, capabilities }
  vocabularySlice.ts{ labels }                              (22)
```

That is the whole store for two phases.

| In the store | Why |
|---|---|
| `authSlice` | Every screen reads it; it changes rarely and must invalidate everything when it does |
| `vocabularySlice` | Same, plus it must re-render every subscriber the instant a label changes (`22` §3) |

| Not in the store | Where instead |
|---|---|
| Server data — campaigns, templates, people | Per-page `use*` hooks over `lib/api.ts` (`20` §4) |
| Form-builder draft | Local component state + autosave |
| Wizard progress | Local state in the wizard route |
| Dialogs, toasts, filters | Local state |
| **The access token** | A module-scoped variable in `lib/api.ts` — never the store (`15` §2) |

**Why not put server data in the store now?** Because whatever we wrote would be replaced in
P3 by the thing actually being graded. Writing a hand-rolled cache in September to delete it
in November is the definition of throwaway work — and the seam that makes it unnecessary is
the per-page hook (§3).

## 3. The seam that makes P3 additive

Every page reaches server data through a hook, never a bare `fetch`:

```ts
// P1-P2
export function useCampaigns() {
  const [data, setData]     = useState<Campaign[]>();
  const [error, setError]   = useState<ApiError>();
  const [loading, setLoad]  = useState(true);
  useEffect(() => { apiGet<Campaign[]>('/api/v1/campaigns')
    .then(setData).catch(setError).finally(() => setLoad(false)); }, []);
  return { data, error, loading };
}

// P3, if RTK Query is chosen — the same signature
export const useCampaigns = () => api.useGetCampaignsQuery();
```

**The hook's signature is the contract.** Pages destructure `{ data, error, loading }` and
know nothing about how it arrived. When P3 lands, the internals change and the pages do not.

This is the single most important thing to get right in P2. A page that calls `apiGet`
directly in a `useEffect` is a page that must be rewritten in November.

## 4. P3 options — UNDECIDED (OPEN-001)

### Option A — RTK Query + hand-written slices *(recommended)*

```
store/
  api/              RTK Query — org, units, roles, grants, people, subjects,
                    templates, campaigns, responses, results
  builderSlice      form-builder draft: questions, dirty flag, undo stack
  wizardSlice       5-step setup state
  authSlice         (existing)
  vocabularySlice   (existing)
  uiSlice           toasts, dialogs, filters
  middleware/
    autosaveMiddleware      debounced persist of builder draft
    capabilityMiddleware    invalidate cached permissions on grant mutations
    analyticsMiddleware     action log for the audit trail
```

Server state gets caching, invalidation and deduplication for free. Genuinely client-side
state — a draft being edited, a wizard mid-flight — gets hand-written reducers, which is
where reducers actually earn their keep.

**The reason this is recommended:** the two custom store middlewares carry the Phase-1 theme
into Phase 3. Being able to say *"the same cross-cutting reasoning that shaped the Express
chain shaped the store"* is a stronger answer than either phase gives alone. `autosave` is a
real cross-cutting concern — every draft-bearing screen needs it, and none of them should
implement it.

**Risk:** a marker looking specifically for reducer and action work may see mostly generated
RTK Query hooks. Mitigated by `builderSlice` and `wizardSlice`, which are substantial
hand-written reducers over genuinely complex state — an undo stack and a reorderable question
array are not trivial.

### Option B — Classic slices and thunks only

No RTK Query. Every fetch is a `createAsyncThunk` with explicit `pending` / `fulfilled` /
`rejected` reducers.

**For:** maximum visible Redux; nothing is generated; every piece of the data flow is
hand-written and explainable.
**Against:** substantial boilerplate, manual cache invalidation, and normalising server data
by hand — which is the part most likely to be got subtly wrong and to eat the phase.

### Option C — RTK Query for nearly everything

Cleanest code, least hand-written Redux. **Weakest option for a phase graded on Redux**, and
listed only for completeness.

### How to decide

Ask what the evaluation rubric actually rewards. If it names reducers, actions, or the store
explicitly, A with the two hand-written slices is comfortably enough. If it rewards
demonstrating async flow by hand, B. **Decide by 15 Oct 2026** so P2's hooks can be shaped
accordingly — the decision has no effect before then (OPEN-001).

## 5. Conventions, whichever option wins

- **Redux Toolkit only.** No hand-written action-type constants, no `redux-thunk` configured
  by hand, no `connect()`.
- **Typed hooks.** `useAppDispatch` / `useAppSelector`, never the bare ones.
- **Selectors co-located** with their slice; memoised with `createSelector` only where a
  derivation is real.
- **No non-serialisable values** in the store — no `Date`, no `File`, no class instances. ISO
  strings, parsed at the edge.
- **Slices own their state shape.** No cross-slice reducers reaching into another's state.
- **The access token never enters the store** (`15` §2).

## 6. Acceptance

**P1–P2**

- [ ] The store contains exactly `authSlice` and `vocabularySlice`
- [ ] No server data is stored outside those two
- [ ] Every page consumes server data through a `use*` hook, verified by grep: no `apiGet` in
      a component body
- [ ] The access token is not in the store, and not in `localStorage`
- [ ] Redux devtools shows a legible action stream at boot

**P3** — written once OPEN-001 is closed. At minimum:

- [ ] No page component changed signature during the migration
- [ ] The builder's undo stack survives a route change and a reload
- [ ] A grant mutation invalidates cached permissions without a reload

## 7. Out of scope

| Not doing | Why |
|---|---|
| Redux persistence to `localStorage` | The only candidate is the builder draft, and it autosaves to the server |
| Redux Saga / Observable | RTK's thunks and RTK Query cover everything here; sagas are a large concept budget for no gain |
| Normalising the org graph in the store | The API returns scoped, pre-shaped trees. Normalising it client-side re-implements the server's job |
| A global loading or error state | Loading and error are per-request facts. A global spinner is how a UI stops telling the truth |
| Optimistic updates everywhere | Only where latency is genuinely felt — the builder and the powers grid. Elsewhere it hides failure |
