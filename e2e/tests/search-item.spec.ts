import { expect, test } from '../fixtures';

test('search resolves typed queries and pasted retailer links', async ({ onboarded: page }) => {
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: 'heinz ketchup' }).click();
  // Brand variants resolve across sizes.
  await expect(page.getByRole('button', { name: /^Heinz ketchup 32 oz/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Heinz ketchup 20 oz/ })).toBeVisible();

  await page.getByLabel('Search items').fill('');
  await page.getByRole('button', { name: 'Paste a link' }).click();
  await expect(
    page.getByRole('button', { name: /Gouge Gap|Sticky Price|Tracking Fuel/ }).first(),
  ).toBeVisible();

  await page.getByLabel('Search items').fill('zzzz');
  await expect(
    page.getByRole('button', { name: /Gouge Gap|Sticky Price|Tracking Fuel/ }),
  ).toHaveCount(0);
});

test('item detail shows the verdict, ledger and sources', async ({ onboarded: page }) => {
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByLabel('Search items').fill('milk');
  await page.getByRole('button', { name: /^Whole milk 1 gal/ }).click();
  await expect(page.getByRole('heading', { name: 'Whole milk' })).toBeVisible();
  await expect(
    page.getByText('Gouge Gap', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText(/Unreturned/)).toBeVisible();
  await expect(page.getByText('Fuel-correlated').first()).toBeVisible();
  await page.getByRole('button', { name: 'Sources' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Data provenance' })).toBeVisible();
  await expect(sheet).toContainText(/Captured.*store ZIP 77002/);
});
