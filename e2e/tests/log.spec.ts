import { expect, test } from '../fixtures';

test.beforeEach(async ({ onboarded: page }) => {
  await page.getByRole('tab', { name: 'Log' }).click();
  await expect(page.getByText(/No prices logged yet/)).toBeVisible();
});

test('scan a receipt, deselect a line and add the rest', async ({ onboarded: page }) => {
  await page.getByRole('button', { name: 'Scan receipt' }).click();
  await page.getByRole('button', { name: 'Capture' }).click();
  await expect(page.getByText('4 of 4 lines selected')).toBeVisible();
  await page.getByRole('checkbox', { name: /^BANANAS/ }).click();
  await expect(page.getByText('3 of 4 lines selected')).toBeVisible();
  await page.getByRole('button', { name: 'Add 3 prices' }).click();
  await expect(page.getByRole('alert')).toHaveText('3 prices added');
  await expect(page.getByText(/No prices logged yet/)).toBeHidden();
  await expect(page.getByText(/WHOLE MILK|Whole milk/).first()).toBeVisible();
});

test('enter a price manually; it stays after a reload', async ({ onboarded: page }) => {
  await page.getByRole('button', { name: 'Enter manually' }).click();
  await page.getByLabel('Item').fill('Oat milk 64 oz');
  await page.getByLabel('Price paid').fill('4.29');
  await page.getByRole('button', { name: 'Walmart' }).click();
  await page.getByRole('button', { name: 'Save price' }).click();
  await expect(page.getByRole('alert')).toHaveText('Price saved');
  await expect(page.getByText('Oat milk 64 oz')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Oat milk 64 oz')).toBeVisible();
});
