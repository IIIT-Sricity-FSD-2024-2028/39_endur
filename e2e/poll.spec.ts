// A poll creates AND launches in one press, so a closing time in the past would hand out a live
// QR code that turns everybody away. The dialog refuses it, and so does the server.
import { expect, test } from '@playwright/test';
import { apiAs, NORTHFIELD_ADMIN, signIn } from './helpers.js';

/** A `datetime-local` value this many minutes from now, in the browser's own time zone. */
const localIn = (minutes: number): string => {
  const at = new Date(Date.now() + minutes * 60_000);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

test('a poll cannot be created with a closing time that has already passed', async ({ page }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  await page.goto('/app/start');
  await page.getByRole('button', { name: 'New poll' }).click();

  const dialog = page.getByRole('dialog', { name: 'New poll' });
  await dialog.getByLabel('What are you asking?').fill(`E2E poll ${Date.now()}`);
  await dialog.getByLabel('Option 1').fill('Yes');
  await dialog.getByLabel('Option 2').fill('No');
  const create = dialog.getByRole('button', { name: 'Create and share' });
  const closes = dialog.getByLabel('Close it automatically (optional)');

  await closes.fill(localIn(-3 * 24 * 60));
  await expect(dialog.getByRole('alert')).toHaveText(/already passed/);
  await expect(create).toBeDisabled();

  await closes.fill(localIn(60));
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await create.click();
  await page.waitForURL(/\/app\/campaigns\/[0-9a-f-]{36}$/);

  // The server says the same to anything that skips the dialog.
  const refused = await (await apiAs(page)).attempt('/campaigns/quick', {
    purpose: 'poll',
    name: 'Too late',
    options: ['a', 'b'],
    endsAt: new Date(Date.now() - 60_000).toISOString(),
  });
  expect(refused.status).toBe(422);
  expect(refused.text).toMatch(/already passed/);
});
