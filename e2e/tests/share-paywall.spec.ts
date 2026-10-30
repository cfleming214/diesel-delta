import { expect, test } from '../fixtures';

test('share card switches sizes and carries an honest footer', async ({ onboarded: page }) => {
  await page.getByRole('button', { name: 'Share this chart' }).click();
  await expect(page.getByRole('heading', { name: 'Share card' })).toBeVisible();
  const card = page.getByLabel(/^Share card: /);
  await expect(card).toHaveAccessibleName(/points gap over 90 days/);
  const story = (await card.boundingBox())!;
  await page.getByRole('tab', { name: 'X 16:9' }).click();
  await expect.poll(async () => (await card.boundingBox())!.height).toBeLessThan(story.height);
  await page.getByRole('tab', { name: 'Square' }).click();
  await expect(page.getByText(/As of Oct 26, 2026 · TX 77002 · EIA retail diesel/)).toBeVisible();
  await expect(page.getByText(/dd\.app\/d\/[a-z2-9]{4}/)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('restore with no purchase, then buy Pro and see it on Insights', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  await page.getByRole('button', { name: 'DieselDelta Pro, Free plan' }).click();
  await page.getByRole('button', { name: 'Restore purchases' }).click();
  await expect(page.getByRole('alert')).toHaveText('No previous purchase found');

  await page.getByRole('radio', { name: /^Monthly, \$3\.99/ }).click();
  await page.getByRole('button', { name: 'Start Pro · $3.99' }).click();
  await expect(page.getByRole('alert')).toHaveText('Pro unlocked');
  await page.getByRole('tab', { name: 'Insights' }).click();
  await expect(page.getByRole('button', { name: 'DieselDelta Pro, Active' })).toBeVisible();
});
