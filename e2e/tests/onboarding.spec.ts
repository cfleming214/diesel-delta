import { expect, onboard, test } from '../fixtures';

test('first launch asks for a ZIP and explains the fuel series it maps to', async ({ page }) => {
  await page.goto('/basket');
  // Deep links are gated until onboarding is done.
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Home ZIP code').fill('77002');
  await expect(page.getByText(/Texas has no state diesel series; using Gulf Coast/)).toBeVisible();
  await expect(page.getByText(/Current price \$\d\.\d\d\/gal/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/TX 77002/)).toBeVisible();
});

test('a California ZIP uses the state diesel series', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Home ZIP code').fill('94103');
  await expect(page.getByText(/State series: California retail diesel/)).toBeVisible();
});

test('the ZIP survives a reload and onboarding is not shown again', async ({ page }) => {
  await onboard(page, '43215');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText(/OH 43215/)).toBeVisible();
});
