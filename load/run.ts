// Stress test: ramps up virtual users replaying app sessions against a Supabase-compatible backend
// (the mock by default, or a live project with --url and --key) and checks latency and error
// thresholds. Writes JSON and Markdown reports; exits 1 when a threshold fails.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { VirtualUser, type Target } from './journeys';
import {
  DEFAULT_THRESHOLDS,
  evaluate,
  summarise,
  throughput,
  type Check,
  type OpSummary,
  type Sample,
  type Thresholds,
} from './stats';

export type LoadConfig = {
  target: Target;
  users: number;
  rampS: number;
  durationS: number;
  thinkMin: number;
  thinkMax: number;
  newUserShare: number;
  seed: number;
  thresholds: Thresholds;
};

export type LoadReport = {
  config: Omit<LoadConfig, 'target'> & { url: string };
  startedAt: string;
  elapsedS: number;
  peakUsers: number;
  journeys: { started: number; completed: number; failed: number };
  requests: number;
  ops: OpSummary[];
  throughputPerS: number[];
  checks: Check[];
  pass: boolean;
};

/** Small seeded PRNG so a run's journeys can be reproduced. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runLoad(
  cfg: LoadConfig,
  onProgress?: (p: { s: number; active: number; requests: number; errors: number }) => void,
): Promise<LoadReport> {
  const random = mulberry32(cfg.seed);
  const samples: Sample[] = [];
  const journeys = { started: 0, completed: 0, failed: 0 };
  const t0 = performance.now();
  const endAt = t0 + cfg.durationS * 1000;
  let active = 0;
  let peakUsers = 0;

  const vu = async (i: number) => {
    await sleep((i / cfg.users) * cfg.rampS * 1000);
    const user = new VirtualUser({
      target: cfg.target,
      random,
      record: (s) => samples.push(s),
      thinkMin: cfg.thinkMin,
      thinkMax: cfg.thinkMax,
      newUserShare: cfg.newUserShare,
      sleep,
    });
    active++;
    peakUsers = Math.max(peakUsers, active);
    // Sessions repeat until the run ends; one in progress at the end is allowed to finish.
    while (performance.now() < endAt) {
      journeys.started++;
      try {
        await user.session();
        journeys.completed++;
      } catch {
        journeys.failed++;
        await user.flush();
      }
      await sleep(cfg.thinkMax * 2000 * random());
    }
    active--;
  };

  const ticker = onProgress
    ? setInterval(
        () =>
          onProgress({
            s: Math.round((performance.now() - t0) / 1000),
            active,
            requests: samples.length,
            errors: samples.filter((s) => !s.ok).length,
          }),
        5000,
      )
    : null;
  await Promise.all(Array.from({ length: cfg.users }, (_, i) => vu(i)));
  if (ticker) clearInterval(ticker);

  const ops = summarise(samples);
  const checks = evaluate(ops, journeys, cfg.thresholds);
  const { target, ...rest } = cfg;
  return {
    config: { ...rest, url: target.url },
    startedAt: new Date(Date.now() - (performance.now() - t0)).toISOString(),
    elapsedS: Math.round((performance.now() - t0) / 100) / 10,
    peakUsers,
    journeys,
    requests: samples.length,
    ops,
    throughputPerS: throughput(samples, t0),
    checks,
    pass: checks.every((c) => c.pass),
  };
}

export function toMarkdown(r: LoadReport): string {
  const rps = r.throughputPerS;
  const peak = Math.max(0, ...rps);
  const mean = rps.length ? rps.reduce((a, b) => a + b, 0) / rps.length : 0;
  const lines = [
    `# Load test: ${r.pass ? 'PASS' : 'FAIL'}`,
    '',
    `${r.startedAt} · ${r.config.url} · ${r.config.users} virtual users (peak ${r.peakUsers} active), ` +
      `${r.config.rampS}s ramp, ${r.config.durationS}s run, think ${r.config.thinkMin}–${r.config.thinkMax}s, seed ${r.config.seed}`,
    '',
    `Journeys: ${r.journeys.completed} completed, ${r.journeys.failed} failed. ` +
      `Requests: ${r.requests} (mean ${mean.toFixed(1)}/s, peak ${peak}/s).`,
    '',
    '## Thresholds',
    '',
    '| Check | Limit | Actual | Result |',
    '| --- | --- | --- | --- |',
    ...r.checks.map(
      (c) => `| ${c.name} | ${c.limit} | ${c.actual} | ${c.pass ? '✓ Pass' : '✕ Fail'} |`,
    ),
    '',
    '## Operations',
    '',
    '| Operation | Requests | Errors | p50 ms | p95 ms | p99 ms | Max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...r.ops.map(
      (o) => `| ${o.op} | ${o.count} | ${o.errors} | ${o.p50} | ${o.p95} | ${o.p99} | ${o.max} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const { values: a } = parseArgs({
    options: {
      url: { type: 'string', default: process.env.LOAD_URL ?? 'http://localhost:54321' },
      key: { type: 'string', default: process.env.LOAD_KEY ?? 'mock-anon-key' },
      users: { type: 'string', default: '500' },
      ramp: { type: 'string', default: '30' },
      duration: { type: 'string', default: '120' },
      'think-min': { type: 'string', default: '1' },
      'think-max': { type: 'string', default: '5' },
      'new-users': { type: 'string', default: '0.35' },
      seed: { type: 'string', default: '1' },
      'p95-ms': { type: 'string', default: String(DEFAULT_THRESHOLDS.p95Ms) },
      'p99-ms': { type: 'string', default: String(DEFAULT_THRESHOLDS.p99Ms) },
      'max-error-rate': { type: 'string', default: String(DEFAULT_THRESHOLDS.maxErrorRate) },
      out: { type: 'string', default: 'load/reports' },
    },
  });
  const cfg: LoadConfig = {
    target: { url: a.url!.replace(/\/$/, ''), key: a.key!, timeoutMs: 10_000 },
    users: Number(a.users),
    rampS: Number(a.ramp),
    durationS: Number(a.duration),
    thinkMin: Number(a['think-min']),
    thinkMax: Number(a['think-max']),
    newUserShare: Number(a['new-users']),
    seed: Number(a.seed),
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      p95Ms: Number(a['p95-ms']),
      p99Ms: Number(a['p99-ms']),
      maxErrorRate: Number(a['max-error-rate']),
    },
  };
  console.log(`${cfg.users} virtual users → ${cfg.target.url} (${cfg.durationS}s)`);
  const report = await runLoad(cfg, (p) =>
    console.log(`  ${p.s}s  active ${p.active}  requests ${p.requests}  errors ${p.errors}`),
  );
  mkdirSync(a.out!, { recursive: true });
  const stem = join(a.out!, `load-${report.startedAt.replace(/[:.]/g, '-')}`);
  writeFileSync(`${stem}.json`, JSON.stringify(report, null, 2));
  const md = toMarkdown(report);
  writeFileSync(`${stem}.md`, md);
  console.log(`\n${md}\nReports: ${stem}.json, ${stem}.md`);
  process.exitCode = report.pass ? 0 : 1;
}

if (process.argv[1]?.endsWith('run.ts')) void main();
