import { drag, expect, test } from '../fixtures';

test('scrubbing the Today chart moves the readout and springs back on release', async ({
  onboarded: page,
}) => {
  const readout = page.getByText(/^Gap at /);
  await expect(readout).toContainText('Oct 26');
  const box = (await page
    .getByRole('slider', { name: 'Basket and diesel, indexed to 100' })
    .boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
  await expect(readout).not.toContainText('Oct 26');
  await page.mouse.up();
  await expect(readout).toContainText('Oct 26');
});

test('changing the window rewrites the verdict', async ({ onboarded: page }) => {
  await expect(page.getByText(/over 90 days/).first()).toBeVisible();
  await page.getByRole('tab', { name: '30D' }).click();
  await expect(page.getByText(/^Diesel (fell|rose) [\d.]+% over 30 days/)).toBeVisible();
  await page.getByRole('tab', { name: '1Y' }).click();
  await expect(page.getByText(/over 12 months/).first()).toBeVisible();
});

test('the chart at the top of Insights: lag slider shifts diesel and reports correlation', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  await expect(page.getByRole('heading', { name: 'Chart' })).toBeVisible();
  await expect(page.getByText('Lag: none')).toBeVisible();
  const lag = (await page.getByRole('slider', { name: 'Lag' }).boundingBox())!;
  await drag(
    page,
    { x: lag.x + 4, y: lag.y + lag.height / 2 },
    { x: lag.x + lag.width * 0.5, y: lag.y + lag.height / 2 },
  );
  await expect(page.getByText(/^Lag: \d+ weeks?$/)).toBeVisible();
  await expect(page.getByText(/Correlation at this lag: [−-]?\d\.\d\d/)).toBeVisible();
});

test('switching to gasoline and the U.S. series changes the region label', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Insights' }).click();
  const scope = page.getByTestId('chart-scope');
  await expect(scope).toHaveText('Gulf Coast');
  await page.getByRole('tab', { name: 'U.S.' }).click();
  await expect(scope).toHaveText('National');
  await page.getByRole('tab', { name: 'Gasoline' }).click();
  await expect(page.getByText(/^Gasoline \$\d\.\d\d/)).toBeVisible();
});

test('Today shows the basket total and 9 nationwide movers that can be paused', async ({
  onboarded: page,
}) => {
  await expect(
    page.getByRole('button', { name: /^Your basket, 16 items, \$\d+\.\d\d, 30 days / }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nationwide movers' })).toBeVisible();
  const movers = page.getByRole('button', { name: /^(Rising|Falling|Stable): / });
  await expect(movers).toHaveCount(9);
  await expect(page.getByRole('button', { name: /^Rising: / })).toHaveCount(3);
  await page.getByRole('button', { name: 'Pause movers' }).click();
  await expect(page.getByText(/^Paused · 30-day change/)).toBeVisible();
  await page
    .getByRole('button', { name: /^Falling: / })
    .first()
    .click();
  await expect(page.getByText('By retailer')).toBeVisible();
});

test('the chart, basket card, Insights and Basket agree on one as-of date and total', async ({
  onboarded: page,
}) => {
  // Today: the 90-day basket change in the chart sentence matches the card's 90D.
  const card = page.getByRole('button', { name: /^Your basket, 16 items, / });
  const label = (await card.getAttribute('aria-label'))!;
  const total = label.match(/(\$\d+\.\d\d)/)![1]!;
  const card90 = label.match(/90 days ([+−-]?\d+\.\d)%/)![1]!.replace('−', '-');
  const sentence = await page.getByText(/^Diesel (rose|fell) .* over 90 days\./).innerText();
  const chart90 = sentence.match(/basket (rose|fell) (\d+\.\d)%/)!;
  expect(`${chart90[1] === 'fell' ? '-' : '+'}${chart90[2]}`).toBe(
    card90.startsWith('-') ? card90 : `+${card90.replace('+', '')}`,
  );
  const asOf = (await page.getByText(/^16 items at the cheapest prices on /).innerText()).replace(
    '16 items at the cheapest prices on ',
    '',
  );

  // Insights: the chart header shows the same basket total, and the region table the same date.
  await page.getByRole('tab', { name: 'Insights' }).click();
  await expect(page.getByText(new RegExp(`^Basket \\${total} · `))).toBeVisible();
  await expect(page.getByText(new RegExp(`diesel series, 90 days to ${asOf}$`))).toBeVisible();

  // Basket: the 90D Basket Delta ends at the same total on the same day.
  await page.getByRole('tab', { name: 'Basket' }).click();
  await page.getByRole('tablist', { name: 'Baseline' }).getByRole('tab', { name: '90D' }).click();
  await expect(page.getByText(new RegExp(`→ \\${total} on ${asOf}$`))).toBeVisible();
});
