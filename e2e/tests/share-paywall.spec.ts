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

test('on the web, Save image downloads the PNG and Share copies the link', async ({
  onboarded: page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Share this chart' }).click();
  await expect(page.getByLabel(/^Share card: /)).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('diesel-data-share.png');
  const png = await (await file.createReadStream()).toArray();
  const bytes = Buffer.concat(png);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  // Story size: 1080×1920, read from the PNG header.
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1920]);
  await expect(page.getByRole('alert')).toHaveText('Image downloaded');

  // Desktop Chromium can't share files, so the link is copied instead.
  const link = await page.getByText(/^dd\.app\/d\/[a-z2-9]{4}$/).innerText();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Link copied. Paste it anywhere to share.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
});

test('restore with no purchase, then buy Pro and see it on Insights', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  await page.getByRole('button', { name: 'Diesel Data Pro, Free plan' }).click();
  await page.getByRole('button', { name: 'Restore purchases' }).click();
  await expect(page.getByRole('alert')).toHaveText('No previous purchase found');

  await page.getByRole('radio', { name: /^Monthly, \$3\.99/ }).click();
  await page.getByRole('button', { name: 'Start Pro · $3.99' }).click();
  await expect(page.getByRole('alert')).toHaveText('Pro unlocked');
  await page.getByRole('tab', { name: 'Insights' }).click();
  await expect(page.getByRole('button', { name: 'Diesel Data Pro, Active' })).toBeVisible();
});
