import { expect, test } from '../fixtures';

test.use({ permissions: ['notifications'] });

test('on the web, alerts are off and explained; tolerance adjusts and persists', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  // The web build can't show notifications, so the alerts stay off and say where they work.
  for (const name of [
    'Diesel crosses $3.25/gal',
    'A followed item drops in price',
    'Delta exceeds tolerance',
  ]) {
    const toggle = page.getByRole('switch', { name });
    await expect(toggle).toBeChecked({ checked: false });
    await expect(toggle).toBeDisabled();
  }
  await expect(
    page.getByText('Alerts arrive as notifications in the iOS and Android app.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Increase' }).click();
  await expect(page.getByText(/^Currently \d+\.\d pts, tolerance 4 pts$/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/tolerance 4 pts/)).toBeVisible();
});

test('scorecard and methodology are reachable', async ({ onboarded: page }) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  await page.getByRole('button', { name: 'Retailer scorecard' }).click();
  await expect(page.getByRole('heading', { name: 'Retailer scorecard' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Grade B\+, Costco/ })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Methodology and sources' }).click();
  await expect(page.getByRole('dialog')).toContainText('U.S. Energy Information Administration');
  await expect(page.getByRole('dialog')).toContainText('A gap is not proof of intent.');
});
