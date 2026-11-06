// "No power, not shown": a role sees only the pages and cards it can use.
import { expect, test, type Page } from '@playwright/test';
import { apiAs, NORTHFIELD_ADMIN, signIn, someoneWithRole } from './helpers.js';

const sidebar = (page: Page) =>
  page.getByRole('navigation', { name: 'Sections' });

test('Faculty has no Templates page, and Start offers only what they can start', async ({ page, browser }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  const faculty = await someoneWithRole(await apiAs(page), 'Faculty');

  const context = await browser.newContext();
  const theirs = await context.newPage();
  await signIn(theirs, faculty);
  await expect(sidebar(theirs).getByRole('link', { name: 'Start' })).toBeVisible();
  await expect(sidebar(theirs).getByRole('link', { name: 'Templates' })).toHaveCount(0);

  await theirs.goto('/app/start');
  await expect(theirs.locator('.start-card-title')).toHaveText(['Poll', 'Suggestion box', 'Feedback']);
  await context.close();
});

test('a Student has no Start at all', async ({ page, browser }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  const student = await someoneWithRole(await apiAs(page), 'Student');

  const context = await browser.newContext();
  const theirs = await context.newPage();
  await signIn(theirs, student);
  await expect(sidebar(theirs).getByRole('link', { name: 'Start' })).toHaveCount(0);
  await expect(sidebar(theirs).getByRole('link', { name: /^Inbox/ })).toBeVisible();
  await context.close();
});
