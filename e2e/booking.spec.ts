// The booking console and the public picker, end to end: an administrator makes something
// bookable, gives it a time and opens it; a stranger with the link takes the time; the
// administrator sees the booking and cancels it. Every step is a thunk in
// store/screens/booking.ts or store/screens/respond.ts.
import { expect, test } from '@playwright/test';
import { apiAs, NORTHFIELD_ADMIN, signIn } from './helpers.js';

test('make it bookable → open it → a stranger books → the console cancels the booking', async ({ page, browser }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  const name = `E2E room ${Date.now()}`;

  await page.goto('/app/booking');
  await page.getByLabel('What can people book?').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const id = page.url().split('/').pop() ?? '';

  // Its details, renamed (this had no screen before R-711).
  await page.getByLabel('Description (optional)').fill('Bring your questions.');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByRole('button', { name: 'Save details' })).toBeDisabled();

  // One time, saved, then opened.
  await page.getByRole('button', { name: 'Add a time' }).click();
  await page.getByLabel('Places').fill('2');
  await page.getByRole('button', { name: 'Save times' }).click();
  await expect(page.getByRole('button', { name: 'Save times' })).toBeDisabled();
  await page.getByRole('button', { name: 'Open for booking' }).click();
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();

  const api = await apiAs(page);
  const bookable = await api.get<{ url: string }>(`/bookables/${id}`);
  const path = new URL(bookable.url).pathname;

  // A stranger: no session at all.
  const context = await browser.newContext();
  const stranger = await context.newPage();
  await stranger.goto(path);
  await expect(stranger.getByRole('heading', { name })).toBeVisible();
  await stranger.getByRole('button', { name: /2 left/ }).click();
  await stranger.getByLabel('Name').fill('Ravi Kumar');
  await stranger.getByLabel('Email').fill('ravi@example.test');
  await stranger.getByRole('button', { name: 'Book this time' }).click();
  await expect(stranger.getByRole('heading', { name: "You're booked." })).toBeVisible();
  await context.close();

  // Back in the console: the booking is there, and the times are locked.
  await page.reload();
  const row = page.getByRole('row', { name: /Ravi Kumar/ });
  await expect(row).toBeVisible();
  await expect(page.getByText(/times are locked/)).toBeVisible();
  await row.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel it' }).click();
  await expect(row.getByText('Cancelled')).toBeVisible();
});
