// T-107 — a name is a name, and the server is where that is decided. DEC-110.
//
// THE OWNER TYPED DIGITS INTO EVERY FIELD ON `/start`, PRESSED CONTINUE, CHOSE A PLAN, RAN THE
// CHECKOUT, AND ONLY THEN MET A 422. Registration and the capture are one transaction
// (`features/auth/service.ts`), so nothing was created and nothing was charged — but the reader
// had no way to know that, and the product had walked them through a payment screen to reject
// them.
//
// THE PAGE NOW CHECKS BEFORE IT ADVANCES, AND THAT IS NOT THE RULE (INV-003). These tests call
// the ROUTE, because `min(1).max(n)` was written out twenty-odd times across the DTOs and every
// copy accepted `"12345"` and `"   "` — the client was not the only thing letting it through.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { nameField, textField } from '@endur/shared';
import { app, setUpOrg, unique, withCsrf } from './helpers.js';

const register = (body: Record<string, unknown>) =>
  request(app).post('/api/v1/auth/register').send({
    email: `${unique('founder')}@example.test`,
    password: 'a-long-enough-password',
    name: 'Founder',
    // UNIQUE, because `register` mints a SLUG from it and a fixed name means the second
    // successful registration in this file collides with the first for `409 slug taken` —
    // which reads as "the DTO refused it" and is nothing of the kind.
    orgName: unique('Northfield'),
    industry: 'custom',
    tier: 'bronze',
    ...body,
  });

describe('nameField — the one definition, DEC-110', () => {
  it('refuses a name with no letter in it', () => {
    expect(nameField(120).safeParse('12345').success).toBe(false);
    expect(nameField(120).safeParse('...').success).toBe(false);
    expect(nameField(120).safeParse('---').success).toBe(false);
    expect(nameField(120).safeParse('42').success).toBe(false);
  });

  it('refuses whitespace, because the trim runs first', () => {
    expect(nameField(120).safeParse('   ').success).toBe(false);
    expect(nameField(120).safeParse('\t\n').success).toBe(false);
    // And it NORMALISES what is stored — a trailing space on a role name is a role the CSV
    // importer will never match against the one somebody typed.
    expect(nameField(120).parse('  Sanjay Iyer  ')).toBe('Sanjay Iyer');
  });

  /**
   * EVERY ALPHABET, not `[A-Za-z]`. The product is generic across organisation types
   * (INV-002) and has no business being English-only about people's names — `\p{L}` with the
   * `u` flag is what makes that true rather than aspirational.
   */
  it('accepts names in any script, and names with punctuation in them', () => {
    for (const name of ['देवनागरी', '中文名', 'Кириллица', 'தமிழ்', "O'Brien", 'Ram-Kumar', 'Nguyễn', '3M Ltd']) {
      expect(nameField(120).safeParse(name), name).toMatchObject({ success: true });
    }
  });

  it('enforces the caller’s length', () => {
    expect(nameField(60).safeParse('a'.repeat(61)).success).toBe(false);
    expect(nameField(60).safeParse('a'.repeat(60)).success).toBe(true);
  });

  /**
   * FREE TEXT IS NOT A NAME. A note reading `+91 98765 43210` is a useful note, and the
   * argument that makes `nameField` right says nothing about a box whose whole purpose is that
   * the writer decides what goes in it. It still trims and still bounds.
   */
  it('lets free text be anything, bounded and trimmed', () => {
    expect(textField(100).safeParse('+91 98765 43210').success).toBe(true);
    expect(textField(100).parse('  spaced  ')).toBe('spaced');
    expect(textField(10).safeParse('x'.repeat(11)).success).toBe(false);
  });
});

describe('registration refuses what the picker used to accept — DEC-110', () => {
  it('refuses a digits-only person name', async () => {
    const res = await register({ name: '12345' });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/at least one letter/i);
  });

  it('refuses a digits-only organisation name', async () => {
    const res = await register({ orgName: '99999' });
    expect(res.status).toBe(422);
  });

  it('refuses a whitespace-only name, and NOTHING is created', async () => {
    const email = `${unique('ws')}@example.test`;
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'a-long-enough-password',
      name: '   ',
      orgName: unique('Northfield'),
      industry: 'custom',
      tier: 'bronze',
    });
    expect(res.status).toBe(422);

    // THE REFUSAL IS BEFORE THE TRANSACTION, so there is no half-made organisation and no
    // ledger row. This is the assertion that says the payment screen was never the problem.
    const { prisma } = await import('../db/client.js');
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('still accepts an ordinary registration', async () => {
    const res = await register({});
    expect(res.status).toBe(201);
  });

  /** The trim reaches the DATABASE, not just the check. */
  it('stores the trimmed name', async () => {
    const email = `${unique('trim')}@example.test`;
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'a-long-enough-password',
      name: '  Anitha Rao  ',
      // Padded AND unique — the padding is what this test is about, the uniqueness is what
      // stops it colliding with the registration above on the slug they would otherwise share.
      orgName: `  ${unique('Northfield')}  `,
      industry: 'custom',
      tier: 'bronze',
    });
    expect(res.status).toBe(201);

    const { prisma } = await import('../db/client.js');
    const user = await prisma.user.findFirst({ where: { email }, select: { name: true } });
    expect(user?.name).toBe('Anitha Rao');
  });
});

describe('the same rule reaches the rest of the product — DEC-110', () => {
  /**
   * `nameField` REPLACED TWENTY-ODD HAND-WRITTEN COPIES, so this asserts a route far from
   * registration to show the rule travelled rather than being bolted onto one form.
   */
  it('refuses a digits-only person and a digits-only subject', async () => {
    const org = await setUpOrg();

    const person = await withCsrf(org, 'post', '/api/v1/people').send({ name: '404' });
    expect(person.status).toBe(422);

    const subject = await withCsrf(org, 'post', '/api/v1/subjects').send({ name: '2026' });
    expect(subject.status).toBe(422);
  });

  /**
   * AND A POLL OPTION IS NOT A NAME. `"2025"` is a completely legitimate answer to choose
   * between, so the blanket rule must NOT have reached here — this is the assertion that
   * catches a future tidy-up applying `nameField` to everything with a string in it.
   */
  it('still allows a numeric poll option', async () => {
    const org = await setUpOrg();
    const res = await withCsrf(org, 'post', '/api/v1/campaigns/quick').send({
      purpose: 'poll',
      name: 'Which year?',
      options: ['2024', '2025', '2026'],
    });
    expect([200, 201]).toContain(res.status);
  });
});
