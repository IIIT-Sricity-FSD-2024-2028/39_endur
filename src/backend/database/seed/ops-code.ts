// Prints the current two-factor code for each seeded operator, so a demo does not need a phone.
// It reads the secret from the database, which is why it refuses to run in production.
import { prisma } from '../../db/client.js';
import { isProd } from '../../lib/config.js';
import { currentCode } from '../../platform/totp.js';

async function main(): Promise<void> {
  if (isProd) throw new Error('ops:code prints a second factor and never runs in production.');
  const operators = await prisma.platformUser.findMany({
    where: { status: 'active' },
    select: { email: true, role: true, mfaSecret: true },
    orderBy: { createdAt: 'asc' },
  });
  if (operators.length === 0) {
    console.log('No operator accounts. Run `npm run db:seed`.');
    return;
  }
  for (const operator of operators) {
    console.log(`${operator.role.padEnd(6)} ${operator.email.padEnd(24)} ${currentCode(operator.mfaSecret)}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    return prisma.$disconnect().then(() => process.exit(1));
  });
