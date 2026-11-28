// What every end-to-end test needs: signing in as a seeded account, calling the API as the
// signed-in page does (cookie and CSRF token), and finding somebody who holds a given role.
import { createHmac } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Every seeded account's password (src/backend/database/seed/index.ts). */
export const PASSWORD = 'endur-demo-password';
export const NORTHFIELD_ADMIN = 'admin@northfield.endur.test';

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app**');
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
}

/** The API, as the signed-in page calls it: same cookie, plus the CSRF header on writes. */
export async function apiAs(page: Page) {
  const request: APIRequestContext = page.request;
  const csrf = ((await (await request.get('/api/v1/auth/csrf')).json()) as { token: string }).token;
  const headers = { 'X-CSRF-Token': csrf };
  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await request.get(`/api/v1${path}`);
      expect(res.ok(), `GET ${path} → ${res.status()}`).toBe(true);
      return ((await res.json()) as { data: T }).data;
    },
    post: async <T>(path: string, body: unknown): Promise<T> => {
      const res = await request.post(`/api/v1${path}`, { data: body, headers });
      expect(res.ok(), `POST ${path} → ${res.status()} ${await res.text()}`).toBe(true);
      return ((await res.json()) as { data: T }).data;
    },
    /** For refusals: whatever came back, without expecting success. */
    attempt: async (path: string, body: unknown): Promise<{ status: number; text: string }> => {
      const res = await request.post(`/api/v1${path}`, { data: body, headers });
      return { status: res.status(), text: await res.text() };
    },
  };
}

type Api = Awaited<ReturnType<typeof apiAs>>;

/** A signed-up (active) person who holds this role, found the way an administrator would. */
export async function someoneWithRole(api: Api, roleName: string): Promise<string> {
  const roles = await api.get<Array<{ id: string; name: string }>>('/roles');
  const role = roles.find((row) => row.name === roleName);
  expect(role, `a role called ${roleName}`).toBeTruthy();
  const people = await api.get<Array<{ email: string | null; account: { state: string } }>>(
    `/people?roleId=${role?.id ?? ''}&limit=50`,
  );
  const person = people.find((row) => row.email && row.account.state === 'active');
  expect(person, `an active ${roleName}`).toBeTruthy();
  return person?.email ?? '';
}

export async function roleId(api: Api, roleName: string): Promise<string> {
  const roles = await api.get<Array<{ id: string; name: string }>>('/roles');
  return roles.find((row) => row.name === roleName)?.id ?? '';
}

// ---- the operator console (/ops)

/** The seeded operators (src/backend/database/seed/operators.ts): one password, fixed secrets. */
export const OPERATOR_PASSWORD = 'endur-ops-password';
export const OWNER_OPERATOR = { email: 'owner@endur.test', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' };
export const STAFF_OPERATOR = { email: 'support@endur.test', secret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' };

/** The six-digit code an authenticator would show now (RFC 6238: HMAC-SHA1, 30 s steps). */
export function totp(secret: string, at: number = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Signs in to `/ops` as a seeded operator, second factor included. */
export async function signInOperator(page: Page, operator: { email: string; secret: string }): Promise<void> {
  await page.goto('/ops/login');
  await page.getByLabel('Email').fill(operator.email);
  await page.getByLabel('Password', { exact: true }).fill(OPERATOR_PASSWORD);
  await page.getByLabel('Six-digit code').fill(totp(operator.secret));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Operator console' })).toBeVisible();
}
