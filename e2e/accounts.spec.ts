// An administrator invites somebody; the link sets their password and signs them in. The
// list's Invite and the link dialog are store/screens/people.ts and widgets; the activation
// page is store/screens/entry.ts, with the password only in its box (DEC-014).
import { expect, test } from '@playwright/test';
import { apiAs, NORTHFIELD_ADMIN, signIn } from './helpers.js';

test('invite from the list → the link → set a password → signed in as them', async ({ page, browser }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  const api = await apiAs(page);
  const stamp = Date.now();
  const name = `Meera Iyer ${stamp}`;
  await api.post('/people', { name, email: `meera.${stamp}@example.test` });

  await page.goto('/app/people');
  await page.getByPlaceholder('Search by name or email').fill(`Meera Iyer ${stamp}`);
  const row = page.getByRole('row', { name: new RegExp(String(stamp)) });
  await row.getByRole('button', { name: 'Invite' }).click();

  const dialog = page.getByRole('dialog', { name: new RegExp(`Sign-in link for ${name}`) });
  await expect(dialog).toBeVisible();
  const link = await dialog.locator('#invite-url').inputValue();
  expect(link).toMatch(/\/activate\//);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(row.getByText(/Pending/)).toBeVisible();

  const context = await browser.newContext();
  const invited = await context.newPage();
  await invited.goto(new URL(link).pathname);
  await expect(invited.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible();
  const set = invited.getByRole('button', { name: 'Set password and sign in' });
  await invited.getByLabel('Password').fill('short');
  await expect(set).toBeDisabled();
  await invited.getByLabel('Password').fill('meeras-own-password');
  await set.click();
  await invited.waitForURL('**/app**');
  await expect(invited.getByRole('button', { name: new RegExp(name) })).toBeVisible();

  // A used link is dead.
  const again = await browser.newContext();
  const late = await again.newPage();
  await late.goto(new URL(link).pathname);
  await expect(late.getByRole('heading', { name: 'That link is not active' })).toBeVisible();
  await again.close();
  await context.close();
});
