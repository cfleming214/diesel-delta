// Front-end load: real Chromium users running the web build concurrently (onboard, Today, Chart,
// Basket) while measuring how long each screen takes to become usable. Needs the e2e web build and
// its mock (npm run e2e:build; mock on 54331; node e2e/serve.mjs dist-e2e). Browsers share this
// machine's CPU, so keep --users near the core count or timings measure the load generator.
import { parseArgs } from 'node:util';

import { chromium, type Browser } from '@playwright/test';

import { percentile } from '../supabase/functions/_shared/metrics.ts';

const ZIPS = ['77002', '10001', '43215', '80202', '94103', '98101', '33101', '60601', '30301'];

type Timing = { step: string; ms: number };

async function user(browser: Browser, web: string, zip: string, timings: Timing[]) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await ctx.newPage();
  const time = async (step: string, fn: () => Promise<unknown>) => {
    const t = performance.now();
    await fn();
    timings.push({ step, ms: performance.now() - t });
  };
  try {
    await time('first load → onboarding', async () => {
      await page.goto(web);
      await page.getByLabel('Home ZIP code').waitFor();
    });
    await page.getByLabel('Home ZIP code').fill(zip);
    await time('ZIP → fuel series shown', () =>
      page.getByText('Fuel series', { exact: true }).waitFor(),
    );
    await time('Continue → Today chart', async () => {
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('slider', { name: 'Basket and diesel, indexed to 100' }).waitFor();
    });
    await time('Today → Chart', async () => {
      await page.getByRole('tab', { name: 'Chart' }).click();
      await page.getByRole('slider', { name: 'Lag' }).waitFor();
    });
    await time('Chart → Basket', async () => {
      await page.getByRole('tab', { name: 'Basket' }).click();
      await page.getByText(/items · weighted by purchase frequency/).waitFor();
    });
  } finally {
    await ctx.close();
  }
}

async function main() {
  const { values: a } = parseArgs({
    options: {
      web: { type: 'string', default: 'http://localhost:8091' },
      users: { type: 'string', default: '5' },
      'p95-ms': { type: 'string', default: '3000' },
    },
  });
  const users = Number(a.users);
  const browser = await chromium.launch();
  const timings: Timing[] = [];
  let failed = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: users }, (_, i) =>
      user(browser, a.web!, ZIPS[i % ZIPS.length]!, timings).catch((e: Error) => {
        failed++;
        console.error(`user ${i}: ${e.message.split('\n')[0]}`);
      }),
    ),
  );
  await browser.close();
  const limit = Number(a['p95-ms']);
  console.log(
    `${users} concurrent browser users in ${((performance.now() - t0) / 1000).toFixed(1)}s, ${failed} failed\n`,
  );
  console.log('| Step | Samples | p50 ms | p95 ms | Result |');
  console.log('| --- | ---: | ---: | ---: | --- |');
  let pass = failed === 0;
  for (const step of [...new Set(timings.map((t) => t.step))]) {
    const ms = timings.filter((t) => t.step === step).map((t) => t.ms);
    const p95 = percentile(ms, 95)!;
    pass &&= p95 < limit;
    console.log(
      `| ${step} | ${ms.length} | ${Math.round(percentile(ms, 50)!)} | ${Math.round(p95)} | ${p95 < limit ? '✓ Pass' : '✕ Fail'} |`,
    );
  }
  process.exitCode = pass ? 0 : 1;
}

void main();
