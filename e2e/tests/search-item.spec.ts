import { expect, test } from '../fixtures';

test('the Search tab filters products and resolves pasted retailer links', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Search' }).click();
  await expect(page.getByText(/^All 150 products/)).toBeVisible();
  await page.getByRole('button', { name: 'heinz ketchup' }).click();
  // Brand variants resolve across sizes, each with its price and 30D/90D/1Y changes.
  await expect(
    page.getByRole('button', { name: /^Heinz ketchup 32 oz, \$\d+\.\d\d at \w+, 30 days/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Heinz ketchup 20 oz/ })).toBeVisible();

  await page.getByLabel('Search items').fill('');
  await page.getByRole('button', { name: 'Paste a link' }).click();
  await expect(page.getByText('Resolved from retailer link')).toBeVisible();

  await page.getByLabel('Search items').fill('zzzz');
  await expect(page.getByText('No tracked item matches “zzzz”.')).toBeVisible();
});

test('a product opens like a quote: range, scrubbing, retailers, then its ledger', async ({
  onboarded: page,
}) => {
  await page.getByRole('tab', { name: 'Search' }).click();
  await page.getByLabel('Search items').fill('whole milk');
  await page.getByRole('button', { name: /^Whole milk 1 gal/ }).click();
  await expect(page.getByRole('heading', { name: 'Whole milk' })).toBeVisible();
  await expect(page.getByText('By retailer')).toBeVisible();
  await expect(page.getByRole('radio', { name: /^(Kroger|Walmart|Amazon), \$/ })).toHaveCount(3);

  const chart = (await page
    .getByRole('img', { name: /^Whole milk price over 90 days/ })
    .boundingBox())!;
  await expect(page.getByText('Drag to read a day')).toBeVisible();
  await page.mouse.move(chart.x + chart.width * 0.8, chart.y + chart.height / 2);
  await page.mouse.down();
  await page.mouse.move(chart.x + chart.width * 0.3, chart.y + chart.height / 2, { steps: 8 });
  await expect(page.getByText('Drag to read a day')).toBeHidden();
  await page.mouse.up();
  await expect(page.getByText('Drag to read a day')).toBeVisible();

  await page.getByRole('tab', { name: '1Y' }).click();
  await expect(page.getByText(/over 1 year$/)).toBeVisible();
  await page.getByRole('radio', { name: /^Kroger, \$/ }).click();
  await expect(page.getByText(/^at Kroger · /)).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Kroger, \$/ })).toBeChecked();

  await page.getByRole('link', { name: 'Price ledger and sources' }).click();
  await expect(page.getByText(/Unreturned/)).toBeVisible();
  await expect(page.getByText('Fuel-correlated').first()).toBeVisible();
  await page.getByRole('button', { name: 'Sources' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Data provenance' })).toBeVisible();
  await expect(sheet).toContainText(/Captured.*store ZIP 77002/);
});
