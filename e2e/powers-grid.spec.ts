// The powers grid's role row and power column stay put while the grid scrolls under them —
// the `position: sticky` that was lost once without any test noticing.
import { expect, test } from '@playwright/test';
import { NORTHFIELD_ADMIN, signIn } from './helpers.js';

test('the header row and the power column are frozen while the grid scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await signIn(page, NORTHFIELD_ADMIN);
  await page.goto('/app/roles');
  await page.getByRole('tab', { name: 'Powers' }).click();

  const scroller = page.locator('.powers-scroll');
  const header = page.locator('.powers-role').first();
  const label = page.locator('.powers-capability').first();
  await expect(header).toBeVisible();

  const before = { header: await header.boundingBox(), label: await label.boundingBox() };
  await scroller.evaluate((el) => { el.scrollTop = 400; el.scrollLeft = 300; });
  const after = { header: await header.boundingBox(), label: await label.boundingBox() };

  expect(after.header?.y).toBeCloseTo(before.header?.y ?? NaN, 0);
  expect(after.label?.x).toBeCloseTo(before.label?.x ?? NaN, 0);
});
