// Moving up a plan through the checkout: the Plan page's state is store/screens/plan.ts, the
// checkout's phase is its widget entry, and the join is the `tierJoined` thunk, which the
// checkout waits on before it says "Payment successful".
import { expect, test } from '@playwright/test';
import { signIn } from './helpers.js';

test('Silver → Gold through the checkout, and the page says Gold afterwards', async ({ page }) => {
  await signIn(page, 'admin@grand-palace.endur.test');
  await page.goto('/app/plan');
  const gold = page.locator('.plan-card').filter({ hasText: 'Gold' });
  await gold.getByRole('button', { name: /Join/ }).click();

  const checkout = page.getByRole('dialog');
  await expect(checkout).toContainText(/already on Silver/);
  await checkout.getByRole('button', { name: /^Pay ₹/ }).click();
  await expect(page.getByText('Payment successful')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 });

  await expect(page.locator('.plan-current-name')).toContainText('Gold');
  await expect(page.getByText(/You are on Gold/)).toBeVisible();
});
