// A tour of console screens whose state moved into slices in R-707 – R-710, each driven in
// the real app: a subject added, a blank form built with its autosave, and the
// organisation's own word for "subject" changed, which re-skins the navigation at once.
// Signed in once for the tour: the sign-in bucket is per email.
import { expect, test, type Page } from '@playwright/test';
import { NORTHFIELD_ADMIN, signIn } from './helpers.js';

test.describe.configure({ mode: 'serial' });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await signIn(page, NORTHFIELD_ADMIN);
});
test.afterAll(async () => {
  await page.close();
});

/** Every inline name on the page, by value (they are inputs, so not page text). */
const names = () =>
  page.locator('input.inline-name').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

test('adds a subject, and it is in the list', async () => {
  const name = `E2E Seminar ${Date.now()}`;
  await page.goto('/app/subjects');
  await page.getByRole('button', { name: /^Add a / }).first().click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(names).toContain(name);
});

test('a blank form → the builder → a question → saved by itself', async () => {
  const name = `E2E form ${Date.now()}`;
  await page.goto('/app/templates');
  await page.getByRole('button', { name: /Blank form/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Blank form' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();

  await page.waitForURL('**/app/forms/*/build');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByPlaceholder('Ask something').last().fill('How was the session?');
  // The builder's autosave (listener middleware), shown by its status line.
  await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 5000 });

  // And it is really saved: back to the list, and the form is there with its question.
  await page.goto('/app/templates');
  await page.getByLabel('Search templates').fill(name);
  await expect(page.getByText(name)).toBeVisible();
});

test('the organisation\'s word for a subject re-skins the navigation at once', async () => {
  await page.goto('/app/settings');
  // Everything inside the words card: the Organization card's button also reads "Saved" when
  // nothing in it has changed, so a page-wide "Saved" matches two buttons.
  const card = page.locator('#words');
  const word = card.locator('#word-subject');
  const original = await word.inputValue();

  await word.fill('Module');
  await card.getByRole('button', { name: 'Save words' }).click();
  await expect(card.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Modules' })).toBeVisible();

  // Put it back, so the rest of the suite reads the seeded words.
  await word.fill(original);
  await card.getByRole('button', { name: 'Save words' }).click();
  await expect(card.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Modules' })).toHaveCount(0);
});
