// The respondent path a QR code starts: no account, no session, the whole form, a thank-you.
import { expect, test } from '@playwright/test';
import { apiAs, NORTHFIELD_ADMIN, signIn } from './helpers.js';

test('a stranger answers an open link and lands on the thank-you page', async ({ page, browser }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  const api = await apiAs(page);
  const open = await api.get<Array<{ access: string; url: string | null; status: string }>>('/campaigns?status=open');
  const link = open.find((row) => row.access === 'public' && row.url);
  expect(link, 'an open public campaign in the seed').toBeTruthy();
  const token = new URL(link?.url ?? 'http://x/r/none').pathname.split('/').pop() ?? '';

  const stranger = await browser.newContext();
  const phone = await stranger.newPage();
  await phone.goto(`/r/${token}`);
  await expect(phone.locator('.rf-form')).toBeVisible();

  for (const group of await phone.locator('fieldset, .q-card').all()) {
    const choice = group.locator('label:has(input[type=radio]), label:has(input[type=checkbox]), button[role=radio]').first();
    if (await choice.count()) await choice.click();
  }
  for (const box of await phone.locator('textarea, input[type=text]').all()) await box.fill('More worked examples.');
  await phone.getByRole('button', { name: 'Submit' }).click();

  await phone.waitForURL(`**/r/${token}/done`);
  await stranger.close();
});
