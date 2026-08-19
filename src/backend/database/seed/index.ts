<<<<<<< HEAD
// Presets, library templates and the four demo orgs. Spec: architecture/50-SEED-AND-DEMO.md.
// Filled by T-025, which is due 22 Aug — earlier than M0, because a seeded demo alone can
// pass the evaluation and an unseeded live build cannot (02 §2).
//
// Deterministic, never randomised: the demo must be identical every run (50 §8).
function main() {
  console.log('seed: nothing to do yet — T-025 fills this (see architecture/50).');
}

main();
=======
// Presets, library templates and the four demo organisations. Spec: 50-SEED-AND-DEMO.md.
//
// Seed data lands 22 Aug, not 26 Aug. A seeded demo alone can pass the evaluation; an
// unseeded live build cannot (02 §2).
//
// DETERMINISTIC, never randomised (50 §8): every run produces the same organisations, the
// same ratings and the same comments, so a rehearsal is evidence about the real demo
// rather than about one throw of the dice.
//
//   npm run db:seed              presets + library templates + 4 demo orgs
//   npm run db:seed -- --demo    demo orgs only, assumes the library exists
//   npm run db:reset             drop -> migrate -> seed
import { estimateSeconds } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { PRESET_LIST } from '../../presets/index.js';
import { DEMO_ORGS, seedOrg, type SeededLogin } from './demo.js';

/** Printed at the end of the run, and the same one the dev login affordance prefills (30). */
const DEMO_PASSWORD = 'endur-demo-password';

async function seedLibrary(): Promise<number> {
  // Library templates carry `orgId = null` (10 §4.2): one copy for everybody, cloned into
  // an organisation on demand rather than duplicated into every org at signup.
  let count = 0;
  for (const preset of PRESET_LIST) {
    for (const seed of preset.templates) {
      const exists = await prisma.template.findFirst({
        where: { orgId: null, name: seed.name, industry: preset.key },
        select: { id: true },
      });
      if (exists) continue;

      await prisma.template.create({
        data: {
          orgId: null,
          name: seed.name,
          category: seed.category,
          industry: preset.key,
          description: seed.description ?? null,
          estimatedSeconds: estimateSeconds(seed.questions.map((question) => question.kind)),
          questions: {
            create: seed.questions.map((question, index) => ({
              kind: question.kind,
              text: question.text,
              config: question.config,
              required: question.required,
              position: index,
            })),
          },
        },
      });
      count += 1;
    }
  }
  return count;
}

async function main(): Promise<void> {
  const demoOnly = process.argv.includes('--demo');
  const started = Date.now();

  if (!demoOnly) {
    const templates = await seedLibrary();
    console.log(`library: ${templates} template${templates === 1 ? '' : 's'}`);
  }

  const logins: SeededLogin[] = [];
  for (const spec of DEMO_ORGS) {
    const existing = await prisma.organization.findUnique({
      where: { slug: spec.slug },
      select: { id: true },
    });
    if (existing) {
      // Re-running the seed must not produce a second Northfield. `db:reset` is the way to
      // start over, and it is the path rehearsed before a demo.
      console.log(`skip:   ${spec.name} already exists`);
      continue;
    }
    const orgStarted = Date.now();
    logins.push(...(await seedOrg(prisma, spec, DEMO_PASSWORD)));
    console.log(`org:    ${spec.name} in ${Date.now() - orgStarted} ms`);
  }

  const [orgs, subjects, campaigns, responses] = await Promise.all([
    prisma.organization.count(),
    prisma.subject.count(),
    prisma.campaign.count(),
    prisma.response.count(),
  ]);

  console.log('');
  console.log(
    `seeded ${orgs} organisations · ${subjects} subjects · ${campaigns} campaigns · ${responses} responses in ${Date.now() - started} ms`,
  );

  if (logins.length > 0) {
    console.log('');
    console.log('Sign in with any of these:');
    for (const login of logins) {
      console.log(`  ${login.org.padEnd(24)} ${login.email.padEnd(32)} ${login.password}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    return prisma.$disconnect().then(() => process.exit(1));
  });
>>>>>>> 95a69183487c1f29e2422c760433704d08948484
