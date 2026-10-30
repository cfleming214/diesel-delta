import { drag, expect, test } from '../fixtures';

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /, (Gouge Gap|Sticky Price|Tracking Fuel), [A-Za-z]+, \$/ });

test.beforeEach(async ({ onboarded: page }) => {
  await page.getByRole('tab', { name: 'Basket' }).click();
  await expect(page.getByText('16 items · weighted by purchase frequency')).toBeVisible();
});

test('remove an item in edit mode and see the basket delta recompute', async ({
  onboarded: page,
}) => {
  const delta = page.getByText(/^\$\d+\.\d\d → \$\d+\.\d\d$/);
  const before = await delta.textContent();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Remove Paper towels' }).click();
  await expect(page.getByRole('alert')).toHaveText('Paper towels removed');
  await expect(page.getByText('15 items · weighted by purchase frequency')).toBeVisible();
  await expect(delta).not.toHaveText(before!);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: /^Paper towels/ })).toHaveCount(0);
});

test('swipe a row left to reveal Remove', async ({ onboarded: page }) => {
  const row = (await page.getByRole('button', { name: /^Bananas · per lb/ }).boundingBox())!;
  const y = row.y + row.height / 2;
  await drag(page, { x: row.x + row.width - 40, y }, { x: row.x + 40, y });
  await page.getByRole('button', { name: 'Remove Bananas' }).click();
  await expect(page.getByText('15 items · weighted by purchase frequency')).toBeVisible();
});

test('drag to reorder persists across a reload', async ({ onboarded: page }) => {
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(rows(page).first()).toHaveAccessibleName(/^Whole milk/);
  const handle = (await page.getByRole('button', { name: 'Reorder Whole milk' }).boundingBox())!;
  const target = (await page.getByRole('button', { name: 'Reorder White bread' }).boundingBox())!;
  await drag(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    { x: handle.x + handle.width / 2, y: target.y + target.height / 2 + 6 },
  );
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(rows(page).first()).toHaveAccessibleName(/^Large eggs/);
  await page.reload();
  await expect(rows(page).first()).toHaveAccessibleName(/^Large eggs/);
});

test('add an item from search and follow it from its detail page', async ({ onboarded: page }) => {
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Search items').fill('yogurt');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Greek yogurt added to basket');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('17 items · weighted by purchase frequency')).toBeVisible();

  await page.getByRole('button', { name: /^Greek yogurt · 32 oz/ }).click();
  await expect(page.getByRole('heading', { name: 'Greek yogurt' })).toBeVisible();
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Unfollow Greek yogurt' })).toBeVisible();
});
