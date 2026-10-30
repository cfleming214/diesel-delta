import { expect, test } from '../fixtures';

test.use({ permissions: ['notifications'] });

test('alert settings toggle, adjust tolerance and persist', async ({ onboarded: page }) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  const diesel = page.getByRole('switch', { name: 'Diesel crosses $3.25/gal' });
  const wasOn = await diesel.isChecked();
  await diesel.click();
  await expect(diesel).toBeChecked({ checked: !wasOn });

  await page.getByRole('button', { name: 'Increase' }).click();
  await expect(page.getByText('Currently 4.1 pts, tolerance 4 pts')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Diesel crosses $3.25/gal' })).toBeChecked({
    checked: !wasOn,
  });
  await expect(page.getByText(/tolerance 4 pts/)).toBeVisible();
});

test('scorecard and methodology are reachable', async ({ onboarded: page }) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  await page.getByRole('button', { name: 'Retailer scorecard' }).click();
  await expect(page.getByRole('heading', { name: 'Retailer scorecard' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Costco, grade B\+/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Methodology and sources' }).click();
  await expect(page.getByRole('dialog')).toContainText('U.S. Energy Information Administration');
  await expect(page.getByRole('dialog')).toContainText('A gap is not proof of intent.');
});
