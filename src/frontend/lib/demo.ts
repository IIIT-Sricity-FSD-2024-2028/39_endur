// The stage affordance. design_specs/design/03 §3.2, spec'd in 30 § Sign in.
//
// WHY THIS EXISTS AT ALL: a user belongs to exactly ONE organisation — `users.org_id` is
// non-null and `(org_id, email)` is the unique key (10) — so there is no multi-org
// membership to switch between and no endpoint that could list one. The four demo orgs are
// four separate accounts. "Switching" is therefore re-authenticating, which is honest about
// what the data model actually says. See OPEN-006.
//
// IT MUST BE IMPOSSIBLE TO SHIP. `import.meta.env.PROD` is replaced by a literal at build
// time, so in a production bundle this is `[]` and the whole switcher, credentials and all,
// is eliminated as dead code. A build-time check, not a runtime flag (30).
export type DemoOrg = {
  slug: string;
  name: string;
  industry: string;
  email: string;
  /**
   * Carried ON each entry rather than as a shared constant next door. A module-level
   * `const DEMO_PASSWORD` is exported, therefore reachable, therefore kept by the
   * minifier — it survived into a production bundle exactly once, on 19 Aug, with no
   * accounts attached but present all the same. Inside the array it is eliminated with
   * the array. Verified by the grep in § Acceptance.
   */
  password: string;
};

const DEMO_PASSWORD = 'endur-demo-password';

export const DEMO_ORGS: DemoOrg[] = import.meta.env.PROD
  ? []
  : [
      { slug: 'northfield', name: 'Northfield University', industry: 'university',
        email: 'admin@northfield.endur.test', password: DEMO_PASSWORD },
      { slug: 'grand-palace', name: 'The Grand Palace', industry: 'hotel',
        email: 'admin@grand-palace.endur.test', password: DEMO_PASSWORD },
      { slug: 'riverside', name: 'Riverside Hospital', industry: 'hospital',
        email: 'admin@riverside.endur.test', password: DEMO_PASSWORD },
      { slug: 'meridian', name: 'Meridian Consulting', industry: 'company',
        email: 'admin@meridian.endur.test', password: DEMO_PASSWORD },
    ];

export const isDemoBuild = (): boolean => DEMO_ORGS.length > 0;

// Acceptance, and it is not theoretical — the first version of this file failed it:
//
//   npm run build -w @endur/web
//   grep -rl "endur-demo-password\|endur.test" src/frontend/dist/   # must find NOTHING
//
// A build-time guard only covers what is INSIDE it. An exported constant beside the guard
// is reachable, so the minifier keeps it.
