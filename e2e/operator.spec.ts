// The operator console (/ops), driven in the real app with a real second factor (R-716).
// Signed in once as the seeded owner; every move after that is in-app navigation, so the
// Redux store survives between steps the way it does for a person (a `page.goto` would
// reload the app and start a new store).
//
// Only Riverside Hospital and The Grand Palace are changed here: every other spec works in
// Northfield.
import { expect, test, type Page } from '@playwright/test';
import { OWNER_OPERATOR, STAFF_OPERATOR, signInOperator } from './helpers.js';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signInOperator(page, OWNER_OPERATOR);
});
test.afterAll(async () => {
  await page.close();
});

const nav = () => page.getByRole('navigation', { name: 'Operator console' });
const go = async (label: string) => {
  await nav().getByRole('link', { name: label, exact: true }).click();
};

/** Opens one organisation from the estate list by searching for it. */
async function openOrg(name: string): Promise<void> {
  await go('Organizations');
  await page.getByLabel('Search organizations by name').fill(name);
  await page.keyboard.press('Enter');
  await page.getByRole('table', { name: 'Organizations' }).getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('the estate: each figure says what it is a share of, and the order survives a visit', async () => {
  await go('Organizations');
  const kpis = page.getByRole('region', { name: 'The estate in numbers' });
  await expect(kpis).toContainText('% active');
  await expect(kpis).toContainText('per organization');
  await expect(page.getByRole('region', { name: 'Plan mix' })).toContainText('add up to 100%');

  await page.getByLabel('Order').selectOption('name');
  const table = page.getByRole('table', { name: 'Organizations' });
  const first = table.getByRole('link').first();
  const name = (await first.textContent()) ?? '';
  await first.click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // Back: the order is still the one chosen, because it is in the store.
  await page.goBack();
  await expect(page.getByLabel('Order')).toHaveValue('name');
});

test('an organisation: the plan override asks first, moves the plan, and the trail records it', async () => {
  await openOrg('Riverside Hospital');
  await page.locator('.plan-card').filter({ hasText: 'Silver' }).getByRole('button', { name: /Set plan/ }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Change Riverside Hospital to Silver?');
  await dialog.getByRole('button', { name: 'Change plan' }).click();

  await expect(page.getByText('Plan set to silver.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Organization', exact: true })).toContainText('Silver');
  const activity = page.getByRole('region', { name: 'Operator activity' });
  await expect(activity).toContainText('Changed a plan');
  await expect(activity).toContainText('Bronze → Silver');

  await activity.getByRole('button', { name: 'Open in the audit trail' }).click();
  await expect(page.getByText('Organization: Riverside Hospital')).toBeVisible();
  await expect(page.getByRole('list').first()).toContainText('Bronze → Silver');
});

test('analytics and earnings read ONE window, and every bar can be read', async () => {
  await go('Analytics');
  await expect(page.getByRole('region', { name: 'The estate in numbers' })).toContainText(' of ');
  await expect(page.getByRole('region', { name: /Plan mix/ })).toContainText('Adds up to 100%');
  await page.getByRole('button', { name: 'Quarterly' }).click();
  await expect(page.getByRole('button', { name: 'Quarterly' })).toHaveAttribute('aria-pressed', 'true');

  await go('Earnings');
  // The window chosen on Analytics.
  await expect(page.getByRole('button', { name: 'Quarterly' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'This window in numbers' })).toContainText('taken in total');

  const revenue = page.getByRole('region', { name: 'Revenue over time' });
  await revenue.getByRole('button').last().focus();
  await expect(revenue.getByRole('status')).toContainText('vs period before');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true');
});

test('team: an owner adds an operator, sees the code once, and the trail records it', async () => {
  const email = `e2e-${Date.now()}@endur.test`;
  await go('Team');
  await page.getByRole('button', { name: 'Add operator' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an operator' });
  await dialog.getByLabel('Name').fill('E2E Operator');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password', { exact: true }).fill('an-e2e-password-long-enough');
  await dialog.getByRole('button', { name: 'Add operator' }).click();

  const created = page.getByRole('region', { name: /E2E Operator can sign in/ });
  await expect(created).toContainText('otpauth://');
  await created.getByRole('button', { name: 'Done, they have it' }).click();
  await expect(created).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Operators' })).toContainText(email);

  await go('Audit trail');
  // Still narrowed to Riverside from the step before: the filter is in the store.
  await expect(page.getByText('Organization: Riverside Hospital')).toBeVisible();
  await page.getByRole('button', { name: 'Every organization' }).click();
  await expect(page.getByRole('list').first()).toContainText(`${email} as staff`);
});

test('support: entering a customer console needs a reason, and the register keeps the visit', async () => {
  await openOrg('The Grand Palace');
  const open = page.getByRole('button', { name: 'Open console' });
  await expect(open).toBeDisabled();
  await page.getByLabel('Why are you going in?').fill('E2E: checking their campaign will launch');
  await open.click();

  // Inside the customer's own console, under the banner they cannot dismiss.
  await page.waitForURL('**/app**');
  await expect(page.getByText('E2E: checking their campaign will launch')).toBeVisible();
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.waitForURL('**/ops');

  await go('Support visits');
  const register = page.getByRole('table', { name: 'Support visits' });
  await expect(register).toContainText('The Grand Palace');
  await expect(register).toContainText('E2E: checking their campaign will launch');
  await expect(register).toContainText('Left');
});

test('logs open, and signing out ends the operator session', async () => {
  await go('Logs');
  await expect(page.getByRole('heading', { level: 1, name: 'Logs' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/ops/login');
  await page.goto('/ops');
  await page.waitForURL('**/ops/login');
});

test('staff see the estate and support, and none of the owner’s pages', async ({ browser }) => {
  const staff = await browser.newPage();
  await signInOperator(staff, STAFF_OPERATOR);
  const menu = staff.getByRole('navigation', { name: 'Operator console' });
  await expect(menu.getByRole('link', { name: 'Organizations', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Support visits' })).toBeVisible();
  for (const absent of ['Analytics', 'Earnings', 'Team']) {
    await expect(menu.getByRole('link', { name: absent, exact: true })).toHaveCount(0);
  }
  // Typed in by hand, the page says why rather than drawing nothing.
  await staff.goto('/ops/earnings');
  await expect(staff.getByText('platform.revenue.read')).toBeVisible();
  await staff.close();
});
