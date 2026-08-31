// Seeds the database: the presets, the shared template library, and four fully populated demo organisations.
// Deterministic on purpose - every run produces the same orgs, ratings and comments, so a rehearsal is real evidence.
//   npm run db:seed            presets + library + demo orgs
//   npm run db:seed -- --demo  demo orgs only
//   npm run db:reset          drop, migrate, then seed
import { estimateSeconds } from '@endur/shared';
import { prisma } from '../../db/client.js';
import { PRESET_LIST } from '../../presets/index.js';
import { DEMO_ORGS, seedOrg, type SeededLogin } from './demo.js';
import { IIIT_NAME, IIIT_SLUG, seedIiitSriCity } from './iiit.js';
import { seedOperators } from './operators.js';

// Printed at the end of the run, and the same login the dev sign-in box pre-fills.
const DEMO_PASSWORD = 'endur-demo-password';

async function seedLibrary(): Promise<number> {
  // Library templates have no orgId: one shared copy, cloned into an organisation on demand.
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
      // Running the seed twice must not create a second copy of an org. Use db:reset to start over.
      console.log(`skip:   ${spec.name} already exists`);
      continue;
    }
    const orgStarted = Date.now();
    logins.push(...(await seedOrg(prisma, spec, DEMO_PASSWORD)));
    console.log(`org:    ${spec.name} in ${Date.now() - orgStarted} ms`);
  }

  // The hand-built college. Not a DEMO_ORGS row - its org chart is stated rather than generated,
  // so it has its own module and its own call. Same skip-if-present guard as the four above.
  {
    const existing = await prisma.organization.findUnique({
      where: { slug: IIIT_SLUG },
      select: { id: true },
    });
    if (existing) {
      console.log(`skip:   ${IIIT_NAME} already exists`);
    } else {
      const orgStarted = Date.now();
      logins.push(...(await seedIiitSriCity(prisma, DEMO_PASSWORD)));
      console.log(`org:    ${IIIT_NAME} in ${Date.now() - orgStarted} ms`);
    }
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

  // Endur's own operator accounts, printed separately because they live in their own table.
  await seedOperators(prisma);

  if (logins.length > 0) {
    console.log('');
    console.log('Sign in with any of these:');
    for (const login of logins) {
      console.log(
        `  ${login.org.padEnd(24)} ${login.role.padEnd(26)} ${login.email.padEnd(38)} ${login.password}`,
      );
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    return prisma.$disconnect().then(() => process.exit(1));
  });
