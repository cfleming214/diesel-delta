import { E2E_MOCK_URL } from '../playwright.config';
import { expect, test } from '../fixtures';

test('every tab opens offline after the first load', async ({ onboarded: page, context }) => {
  await context.setOffline(true);
  for (const [tab, heading] of [
    ['Search', 'Search'],
    ['Basket', 'Basket'],
    ['Log', 'Log'],
    ['Insights', 'Insights'],
    ['Today', 'Today'],
  ] as const) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toBeHidden();
  }
  await context.setOffline(false);
});

test('a failed load offers Retry, which recovers once the backend is back', async ({
  onboarded: page,
}) => {
  // Drop the cached fuel series and take the backend away.
  await page.evaluate(() => localStorage.removeItem('dd.query-cache'));
  await page.route(`${E2E_MOCK_URL}/**`, (route) => route.abort());
  await page.reload();
  await expect(page.getByText(/^Prices could not be loaded\./)).toBeVisible({ timeout: 15_000 });

  await page.unroute(`${E2E_MOCK_URL}/**`);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Drag to scrub · indexed to 100')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeHidden();
});

test('onboarding with the backend down says so in plain words, then recovers', async ({ page }) => {
  await page.route(`${E2E_MOCK_URL}/**`, (route) => route.abort());
  await page.goto('/');
  await page.getByLabel('Home ZIP code').fill('77002');
  await expect(
    page.getByText('Fuel prices could not be loaded. Check your connection and try again.'),
  ).toBeVisible();
  await expect(page.getByText(/TypeError|Failed to fetch/)).toHaveCount(0);
  await page.unroute(`${E2E_MOCK_URL}/**`);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(/Texas has no state diesel series/)).toBeVisible();
});

test('an unknown link shows the not-found screen', async ({ onboarded: page }) => {
  await page.goto('/nope/route');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Sitemap')).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});
