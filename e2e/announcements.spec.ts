// An announcement from the composer to a member's Home: written and published through
// store/screens/announcements.ts, read on Home and put away with "Got it" (home's
// `announcementDismissed`).
import { expect, test } from '@playwright/test';
import { apiAs, NORTHFIELD_ADMIN, signIn, someoneWithRole } from './helpers.js';

test('write → publish → it is on a member\'s Home → Got it puts it away', async ({ page, browser }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  const student = await someoneWithRole(await apiAs(page), 'Student');
  const title = `E2E notice ${Date.now()}`;

  await page.goto('/app/announcements');
  await page.getByRole('button', { name: /New announcement/ }).click();
  const composer = page.getByRole('dialog', { name: 'New announcement' });
  await composer.getByLabel('Title').fill(title);
  await composer.getByLabel('What do you want to say?').fill('The library closes early on Friday.');
  // The server's count of who it reaches, once the audience settles.
  await expect(composer.getByText(/will get this\./)).toBeVisible();
  await composer.getByRole('button', { name: 'Save draft' }).click();
  await expect(composer).toHaveCount(0);

  const card = page.locator('article').filter({ hasText: title });
  await card.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Publish' }).click();
  await expect(card.getByText(/of \d+ have read this/)).toBeVisible();

  const context = await browser.newContext();
  const theirs = await context.newPage();
  await signIn(theirs, student);
  const banner = theirs.getByRole('list', { name: 'Announcements' }).locator('li').filter({ hasText: title });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Got it' }).click();
  await expect(banner).toHaveCount(0);
  // Still put away after a reload: the receipt was written, not just hidden.
  await theirs.reload();
  await expect(theirs.getByText(title)).toHaveCount(0);
  await context.close();
});
