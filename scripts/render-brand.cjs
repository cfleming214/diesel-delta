// Renders the app icons, splash, favicon and logo PNGs from the SVG masters in assets/brand.
// Usage: npm run brand:render (needs Playwright Chromium: npx playwright install chromium).
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const { chromium } = require(path.join(root, 'node_modules/playwright'));
const brand = (f) => fs.readFileSync(path.join(root, 'assets/brand', f), 'utf8');
const font = (w, n) =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(root, `node_modules/@expo-google-fonts/inter/${n}/Inter_${n}.ttf`)).toString('base64')})}`;
const css = `html,body{margin:0;background:transparent}${font(400, '400Regular')}${font(700, '700Bold')}svg{display:block}`;
// Place an SVG (viewBox 0 0 100 100 mark, or any svg) at x,y,size on a w×h canvas.
const place = (svg, x, y, w, h) =>
  `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `)}</div>`;
const mark = brand('diesel-data-mark.svg');
const mono = brand('diesel-data-mark-mono.svg');
const icon = brand('diesel-data-app-icon.svg');
const ground = icon.replace(/<svg x="192"[\s\S]*?<\/svg>\n/, '');
const small = brand('diesel-data-mark-small.svg');
const centered = (svg, canvas, size) =>
  place(svg, (canvas - size) / 2, (canvas - size) / 2, size, size);
const jobs = [
  ['assets/images/icon.png', 1024, 1024, place(icon, 0, 0, 1024, 1024), false],
  ['assets/images/android-icon-background.png', 512, 512, place(ground, 0, 0, 512, 512), false],
  ['assets/images/android-icon-foreground.png', 512, 512, centered(mark, 512, 300), true],
  ['assets/images/android-icon-monochrome.png', 432, 432, centered(mono, 432, 253), true],
  ['assets/images/splash-icon.png', 228, 228, place(mark, 0, 0, 228, 228), true],
  [
    'assets/images/favicon.png',
    48,
    48,
    `<div style="position:relative;width:48px;height:48px;border-radius:11px;overflow:hidden">${place(ground, 0, 0, 48, 48)}${centered(small, 48, 36)}</div>`,
    true,
  ],
  ['assets/brand/png/diesel-data-mark-1024.png', 1024, 1024, place(mark, 0, 0, 1024, 1024), true],
  [
    'assets/brand/png/diesel-data-logo@2x.png',
    912,
    192,
    place(brand('diesel-data-logo.svg'), 0, 0, 912, 192),
    true,
  ],
  [
    'assets/brand/png/diesel-data-logo-light@2x.png',
    912,
    192,
    place(brand('diesel-data-logo-light.svg'), 0, 0, 912, 192),
    true,
  ],
];
(async () => {
  const browser = await chromium.launch();
  for (const [out, w, h, body, transparent] of jobs) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>${css}</style></head><body><div style="position:relative;width:${w}px;height:${h}px">${body}</div></body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
    await page.screenshot({
      path: path.join(root, out),
      omitBackground: transparent,
      clip: { x: 0, y: 0, width: w, height: h },
    });
    if (out.includes('logo')) {
      const r = await page.evaluate(() => {
        const b = document.querySelector('text').getBBox();
        return [b.x + b.width, document.fonts.check('700 64px Inter')];
      });
      console.log(out, 'text right edge', Math.round(r[0]), 'of 456, Inter loaded:', r[1]);
    }
    await page.close();
  }
  await browser.close();
})();
