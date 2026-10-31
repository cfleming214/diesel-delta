import AxeBuilder from '@axe-core/playwright';

import { expect, test } from '../fixtures';

const SCREENS = [
  '/',
  '/basket',
  '/log',
  '/insights',
  '/search',
  '/item/milk',
  '/share',
  '/paywall',
  '/retailers',
];

for (const path of SCREENS) {
  test(`no serious accessibility violations on ${path}`, async ({ onboarded: page }) => {
    await page.goto(path);
    await expect(
      page
        .getByRole('heading', { level: 1 })
        .or(page.getByLabel('Search items'))
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    // label-content-name-mismatch is off: axe joins the text of adjacent block elements without
    // spaces ("Costco212 items tracked"), and react-native-web renders every Text as a block div, so
    // it flags any labelled row even when the label repeats the visible text verbatim. Labels put
    // the visible text first instead (checked by the selectors in the other specs).
    const { violations } = await new AxeBuilder({ page })
      .disableRules(['label-content-name-mismatch'])
      .analyze();
    const serious = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help} — ${v.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 3)
            .join(', ')}`,
      );
    expect(serious).toEqual([]);
  });
}
