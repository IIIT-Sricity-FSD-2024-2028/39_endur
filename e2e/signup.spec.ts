// A new organisation from nothing, then the account's own page: the two flows where the
// password lives only in its input (DEC-014 under DEC-R03). Sign-up keeps it across the plan
// step by hiding the details form rather than unmounting it; "My account" changes it, and
// the new one is what signs in afterwards.
import { expect, test } from '@playwright/test';

const NEW_PASSWORD = 'a-brand-new-password';

test('sign up on a trial → the wizard → My account → change the password → sign in with it', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  const original = 'the-first-password';

  await page.goto('/start');
  await page.getByLabel('Organization name').fill('E2E Polytechnic');
  await page.getByLabel('Your name').fill('Asha Verma');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(original);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Choose a plan' })).toBeVisible();
  // Back and forward again: nothing is retyped, the password included.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Work email')).toHaveValue(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await page.locator('label:has(input[type=radio][value=silver])').click();
  await page.getByRole('button', { name: /Start 14-day trial instead/ }).click();
  await page.waitForURL('**/app/setup**');

  // The account's own page, from the user menu (it was linked from nowhere before R-712).
  await page.getByRole('button', { name: /Asha Verma/ }).click();
  await page.getByRole('menuitem', { name: 'My account' }).click();
  await page.waitForURL('**/app/profile');
  await expect(page.getByLabel('Email')).toHaveValue(email);

  const change = page.getByRole('button', { name: 'Change password' });
  await expect(change).toBeDisabled();
  await page.getByLabel('Current password').fill(original);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await change.click();
  await expect(page.getByText(/Changed\. You are still signed in here/)).toBeVisible();
  // Both boxes are emptied: a used credential is not left on screen.
  await expect(page.getByLabel('Current password')).toHaveValue('');
  await expect(page.getByLabel('New password')).toHaveValue('');

  // Out, and back in with the new one.
  await page.getByRole('button', { name: /Asha Verma/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app/**');
});

test('a wrong password says so and keeps what was typed', async ({ page }) => {
  await page.goto('/login');
  // An address nobody else in the suite signs in with: a refusal counts against the
  // per-email sign-in limit, and the seeded admin's budget belongs to the other specs.
  await page.getByLabel('Email').fill('nobody@northfield.endur.test');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match.");
  await expect(page.getByLabel('Email')).toHaveValue('nobody@northfield.endur.test');
});
