// A members-only campaign reaches the Home page of the people it is for, and is answered there.
import { expect, test } from '@playwright/test';
import { apiAs, NORTHFIELD_ADMIN, roleId, signIn, someoneWithRole } from './helpers.js';

test('launch for a role → it waits on their Home → answered inline → into past feedback', async ({ page, browser }) => {
  await signIn(page, NORTHFIELD_ADMIN);
  const api = await apiAs(page);
  const student = await someoneWithRole(api, 'Student');

  const templates = await api.get<Array<{ id: string; name: string; questionCount: number }>>('/templates');
  const form = templates.find((row) => row.questionCount > 0 && row.questionCount <= 3) ?? templates[0];
  const subjects = await api.get<Array<{ id: string }>>('/subjects');
  const name = `E2E check-in ${Date.now()}`;
  const created = await api.post<{ id: string }>('/campaigns', {
    name,
    templateId: form?.id,
    subjectIds: [subjects[0]?.id],
    audience: { kind: 'role', roleId: await roleId(api, 'Student') },
    access: 'organization',
  });
  await api.post(`/campaigns/${created.id}/launch`, {});

  const context = await browser.newContext();
  const theirs = await context.newPage();
  await signIn(theirs, student);

  await expect(theirs.locator('.sidebar-count')).toHaveText(/[1-9]/);
  await theirs.getByRole('button', { name: `Answer “${name}”` }).click();
  const formOnHome = theirs.locator('.waiting-form');
  await expect(formOnHome.locator('.rf-form')).toBeVisible();

  // One answer per question, whatever the form asks: the first option of each group, and words
  // in each text box.
  for (const group of await formOnHome.locator('fieldset, .q-card').all()) {
    const choice = group.locator('label:has(input[type=radio]), label:has(input[type=checkbox]), button[role=radio]').first();
    if (await choice.count()) await choice.click();
  }
  for (const box of await formOnHome.locator('textarea, input[type=text]').all()) await box.fill('Fine.');
  await formOnHome.getByRole('button', { name: 'Submit' }).click();

  await expect(theirs.getByText(`Sent. Thank you for answering “${name}”.`)).toBeVisible();
  await expect(theirs.getByRole('button', { name: `Answer “${name}”` })).toHaveCount(0);
  // It moves to their past feedback, which says THAT they answered and never shows what.
  const pastFeedback = theirs.getByRole('region', { name: /Your past feedback/ });
  await expect(pastFeedback.getByText(name)).toBeVisible();
  await expect(pastFeedback.getByText(/never what you said/)).toBeVisible();

  // And the message that told them it was there.
  await theirs.goto('/app/inbox');
  await expect(theirs.getByText(`Waiting for your answer: ${name}`)).toBeVisible();
  await context.close();
});
