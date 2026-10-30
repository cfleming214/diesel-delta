import { expect, test as base, type Page } from '@playwright/test';

/** Completes onboarding with a ZIP and lands on Today. Each test gets fresh storage. */
export async function onboard(page: Page, zip = '77002') {
  await page.goto('/');
  await page.getByLabel('Home ZIP code').fill(zip);
  await expect(page.getByText('Fuel series', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

/** Drags from one point to another in small steps so pan gestures register. */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

export const test = base.extend<{ onboarded: Page }>({
  onboarded: async ({ page }, use) => {
    await onboard(page);
    await use(page);
  },
});

export { expect };
