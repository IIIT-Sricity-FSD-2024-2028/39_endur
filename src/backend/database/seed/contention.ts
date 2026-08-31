// The contention demo: many phones, one slot, and the row lock that decides who gets in.
// The test already proves capacity holds under load; this exists so it can be SHOWN on a projector.
// It runs entirely over HTTP against the real server, so the whole chain is exercised, not just the lock.
import { prisma } from '../../db/client.js';
import { config, isProd } from '../../lib/config.js';

type Json = Record<string, unknown>;

const HOUR = 60 * 60 * 1000;
const at = (hoursFromNow: number): string => new Date(Date.now() + hoursFromNow * HOUR).toISOString();

// --n 40 / --capacity 10 / --keep. The defaults are the numbers that read well on a projector.
function flags(): { n: number; capacity: number; keep: boolean } {
  const argv = process.argv.slice(2);
  const value = (name: string, fallback: number): number => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return fallback;
    const parsed = Number(argv[index + 1]);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`--${name} needs a positive whole number`);
    }
    return parsed;
  };
  return { n: value('n', 40), capacity: value('capacity', 10), keep: argv.includes('--keep') };
}

// A tiny cookie jar, because the session is a cookie and CSRF is double-submit, so both must survive between calls.
class Client {
  private cookies = new Map<string, string>();
  private csrf = '';

  constructor(private readonly base: string) {}

  async call(method: string, path: string, body?: Json): Promise<{ status: number; json: Json }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cookies.size > 0) {
      headers['Cookie'] = [...this.cookies].map(([name, v]) => `${name}=${v}`).join('; ');
    }
    if (this.csrf) headers['X-CSRF-Token'] = this.csrf;

    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...rest] = (pair ?? '').split('=');
      if (name) this.cookies.set(name, rest.join('='));
    }
    const json = (await res.json().catch(() => ({}))) as Json;
    return { status: res.status, json };
  }

  // Every write needs the CSRF token, re-read after sign-in because the session rotates.
  async refreshCsrf(): Promise<void> {
    const res = await this.call('GET', '/api/v1/auth/csrf');
    this.csrf = String((res.json as { token?: string }).token ?? '');
  }
}

const data = (res: { json: Json }): Json => (res.json['data'] ?? {}) as Json;

function expect(ok: boolean, what: string, detail?: unknown): void {
  if (ok) return;
  console.error(`\n  ✗ ${what}`);
  if (detail !== undefined) console.error(`    ${JSON.stringify(detail)}`);
  process.exitCode = 1;
  throw new Error(what);
}

async function main(): Promise<void> {
  // A development script: it registers organisations and writes freely, so it refuses to run elsewhere.
  if (isProd) throw new Error('demo:contention registers throwaway organisations and never runs in production.');

  const { n, capacity, keep } = flags();
  expect(n > capacity, `--n (${n}) must exceed --capacity (${capacity}), or nobody loses and nothing is shown`);

  const base = config.API_BASE_URL.replace(/\/$/, '');
  const client = new Client(base);

  const reachable = await fetch(`${base}/healthz`).catch(() => null);
  expect(reachable !== null && reachable.ok, `the API is not answering at ${base} — start it with \`npm run dev\``);

  console.log(`\n  CONTENTION — ${n} phones, one slot, capacity ${capacity}`);
  console.log(`  ${'server'.padEnd(10)} ${base}`);

  // Setup, done through the same API a person would use.

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  // Registers at gold, because booking is a gold feature - the tier gate is part of what is shown.
  const registered = await client.call('POST', '/api/v1/auth/register', {
    email: `contention-${stamp}@example.test`,
    password: 'a-long-enough-password',
    name: 'Contention Demo',
    orgName: `Contention ${stamp}`,
    industry: 'hotel',
    tier: 'gold',
  });
  expect(registered.status === 201, 'could not register the throwaway organisation', registered.json);
  const organization = registered.json['organization'] as { id?: string } | undefined;
  const orgId = organization?.id ?? '';
  await client.refreshCsrf();

  const bookable = await client.call('POST', '/api/v1/bookables', { name: `Room ${stamp.slice(-4)}` });
  expect(bookable.status === 201, 'could not create the bookable', bookable.json);
  const bookableId = String(data(bookable)['id']);

  const startsAt = at(24);
  const endsAt = at(25);
  const slots = await client.call('PUT', `/api/v1/bookables/${bookableId}/slots`, {
    slots: [{ startsAt, endsAt, capacity }],
  });
  expect(slots.status === 200, 'could not write the slot', slots.json);

  const opened = await client.call('POST', `/api/v1/bookables/${bookableId}/open`);
  expect(opened.status === 200, 'could not open the bookable', opened.json);
  const token = String(data(opened)['publicToken']);

  // Read the way a phone does: no session, no CSRF, just the token from the QR code.
  const publicRead = await fetch(`${base}/api/v1/public/bookables/${token}`);
  const publicBody = (await publicRead.json()) as { data: { slots: Array<{ id: string; remaining: number }> } };
  const slot = publicBody.data.slots[0];
  expect(slot !== undefined, 'the public payload carried no slot', publicBody);
  const slotId = (slot as { id: string }).id;

  console.log(`  ${'slot'.padEnd(10)} ${startsAt} → ${endsAt}`);
  console.log(`  ${'link'.padEnd(10)} ${config.PUBLIC_BASE_URL}/book/${token}`);
  console.log(`\n  firing ${n} concurrent POSTs …\n`);

  // The burst.

  // Built first and fired second: building inside Promise.all would stagger the requests and prove nothing.
  const started = Date.now();
  const attempts = Array.from({ length: n }, (_unused, index) => async (): Promise<{ status: number; ms: number }> => {
    const began = Date.now();
    const res = await fetch(`${base}/api/v1/public/bookables/${token}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slotId,
        name: `Guest ${index + 1}`,
        email: `guest${index + 1}-${stamp}@example.test`,
      }),
    });
    return { status: res.status, ms: Date.now() - began };
  });
  const results = await Promise.all(attempts.map((run) => run()));
  const elapsed = Date.now() - started;

  // What happened.

  const won = results.filter((r) => r.status === 201);
  const lost = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);
  const times = results.map((r) => r.ms).sort((a, b) => a - b);

  const row = (label: string, value: string | number, note = ''): void =>
    console.log(`  ${label.padEnd(28)} ${String(value).padStart(4)}   ${note}`);

  row('201 booked', won.length, won.length === capacity ? '✓ exactly capacity' : '✗ NOT capacity');
  // 409, not 400: the request was fine and simply lost the race.
  row('409 slot full', lost.length, lost.length === n - capacity ? '✓ everyone else' : '✗');
  row('anything else', other.length, other.length === 0 ? '✓ none' : `✗ ${JSON.stringify(other)}`);

  // The half a status code cannot prove - ask the database how many bookings really exist.
  const rows = await prisma.booking.count({ where: { slotId, cancelledAt: null } });
  const after = await fetch(`${base}/api/v1/public/bookables/${token}`);
  const afterBody = (await after.json()) as { data: { slots: Array<{ remaining: number }> } };
  const remaining = afterBody.data.slots[0]?.remaining;

  console.log('');
  row('rows in the database', rows, rows === capacity ? '✓ agrees with the API' : '✗ DOUBLE BOOKED');
  row('slot reports remaining', String(remaining), remaining === 0 ? '✓ full' : '✗');
  console.log('');
  row('fastest', `${times[0] ?? 0}ms`);
  row('slowest', `${times[times.length - 1] ?? 0}ms`);
  row('all answered in', `${elapsed}ms`);

  expect(won.length === capacity, `expected exactly ${capacity} winners, got ${won.length}`);
  expect(rows === capacity, `expected exactly ${capacity} rows, got ${rows}`);
  expect(other.length === 0, 'some requests came back neither 201 nor 409');

  console.log(`\n  ${n} tried, ${capacity} got in, 0 double-booked.\n`);

  if (keep) {
    console.log(`  --keep: organisation ${orgId} left in place.\n`);
    return;
  }
  // Throwaway means throwaway: this removes the bookable, its slots and its bookings.
  await prisma.organization.delete({ where: { id: orgId } });
}

main()
  .then(() => prisma.$disconnect())
  .catch((error: unknown) => {
    if (process.exitCode !== 1) console.error(error);
    return prisma.$disconnect().then(() => process.exit(1));
  });
