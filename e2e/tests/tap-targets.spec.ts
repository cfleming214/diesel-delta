import { expect, test } from '../fixtures';

const SCREENS = [
  '/',
  '/search',
  '/basket',
  '/log',
  '/insights',
  '/item/milk',
  '/product/milk',
  '/share',
  '/paywall',
  '/retailers',
];
const MIN = 44;

for (const path of SCREENS) {
  test(`every control on ${path} is at least 44×44`, async ({ onboarded: page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const small = await page.evaluate((min) => {
      const sel =
        'button, a[href], input, [role=button], [role=tab], [role=switch], [role=radio], [role=link]';
      return [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((el) => el.checkVisibility() && el.closest('[aria-hidden=true]') == null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const name = el.getAttribute('aria-label') ?? el.innerText.replace(/\s+/g, ' ');
          return { name: name.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((c) => c.w > 0 && c.h > 0 && (c.w < min || c.h < min));
    }, MIN);
    expect(small).toEqual([]);
  });
}
