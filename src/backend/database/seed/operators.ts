// The two Endur operator accounts, seeded because there is no public sign-up for them.
// Their two-factor secrets are fixed like the rest of the seed, so a rehearsal can be repeated;
// they are development credentials in a public repository and are worth exactly that.
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../auth/password.js';
import { currentCode, otpauthUrl } from '../../platform/totp.js';

export const OPERATOR_PASSWORD = 'endur-ops-password';

const OPERATORS = [
  {
    email: 'owner@endur.test',
    name: 'Endur Owner',
    role: 'owner',
    secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  },
  {
    email: 'support@endur.test',
    name: 'Endur Support',
    role: 'staff',
    secret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU',
  },
  {
    email: 'owner2@endur.test',
    name: 'Endur Owner Two',
    role: 'owner',
    secret: 'MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK',
  },
  {
    email: 'support2@endur.test',
    name: 'Endur Support Two',
    role: 'staff',
    secret: 'NBSWY3DPO5XXE3DENBSWY3DPO5XXE3DE',
  },
] as const;

export async function seedOperators(prisma: PrismaClient): Promise<void> {
  const passwordHash = await hashPassword(OPERATOR_PASSWORD);
  const lines: string[] = [];

  for (const spec of OPERATORS) {
    const existing = await prisma.platformUser.findUnique({
      where: { email: spec.email },
      select: { id: true },
    });
    if (!existing) {
      await prisma.platformUser.create({
        data: {
          email: spec.email,
          name: spec.name,
          role: spec.role,
          passwordHash,
          mfaSecret: spec.secret,
        },
      });
    }
    lines.push(
      `  ${spec.role.padEnd(6)} ${spec.email.padEnd(22)} ${OPERATOR_PASSWORD}   code now: ${currentCode(spec.secret)}`,
    );
  }

  console.log('');
  console.log('Operator console (/ops) — MFA is required (19 §9):');
  for (const line of lines) console.log(line);
  console.log(`  scan: ${otpauthUrl(OPERATORS[0].email, OPERATORS[0].secret)}`);
  console.log('  or run: npm run ops:code -w @endur/api');
}
