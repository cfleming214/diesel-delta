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

test('the chart explorer lag slider shifts diesel and reports correlation', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Chart' }).click();
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
  await page.getByRole('tab', { name: 'Chart' }).click();
  await expect(page.getByText('Gulf Coast', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'U.S.' }).click();
  await expect(page.getByText('Gulf Coast', { exact: true })).toBeHidden();
  await page.getByRole('tab', { name: 'Gasoline' }).click();
  await expect(page.getByText(/^Gasoline \$\d\.\d\d/)).toBeVisible();
});
