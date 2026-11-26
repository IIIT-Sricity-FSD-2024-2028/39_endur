// What every end-to-end test needs: signing in as a seeded account, calling the API as the
// signed-in page does (cookie and CSRF token), and finding somebody who holds a given role.
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
