// Prints the current TOTP code for each seeded operator.
//
// The demo needs a working six-digit code and an authenticator app is a phone away, so
// this is the affordance that makes MFA a feature to show rather than an obstacle to
// apologise for. It reads `mfa_secret` from the database, which is precisely why it is a
// DEVELOPMENT script: anything that can print a code can bypass the second factor, so it
// refuses to run in production rather than trusting nobody will.
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
