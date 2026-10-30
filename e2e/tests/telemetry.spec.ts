import { E2E_MOCK_URL } from '../playwright.config';
import { expect, test } from '../fixtures';

test('app events reach the backend and the admin metrics', async ({ onboarded: page, request }) => {
  await page.getByRole('tab', { name: 'Basket' }).click();
  await page.getByRole('tab', { name: 'Today' }).click();
  // Events are batched; poll the admin API until this session's events have landed.
  await expect
    .poll(
      async () => {
        const res = await request.get(`${E2E_MOCK_URL}/admin/api/metrics?token=mock-admin`);
        const snap = (await res.json()) as { eventCounts: { name: string; count: number }[] };
        return snap.eventCounts.map((e) => e.name);
      },
      { timeout: 20_000 },
    )
    .toEqual(expect.arrayContaining(['app_open', 'onboarding_complete', 'screen_view']));
});
