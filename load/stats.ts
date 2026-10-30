import { percentile } from '../supabase/functions/_shared/metrics.ts';

export type Sample = { op: string; at: number; ms: number; status: number; ok: boolean };

export type OpSummary = {
  op: string;
  count: number;
  errors: number;
  errorRate: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
};

export type Thresholds = {
  /** Applies to every operation. */
  p95Ms: number;
  p99Ms: number;
  /** Fraction of all requests (0–1). */
  maxErrorRate: number;
  /** Fraction of started journeys that must finish (0–1). */
  minCompletion: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  p95Ms: 500,
  p99Ms: 1000,
  maxErrorRate: 0.01,
  minCompletion: 0.99,
};

const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export function summarise(samples: readonly Sample[]): OpSummary[] {
  const byOp = new Map<string, Sample[]>();
  for (const s of samples) byOp.set(s.op, [...(byOp.get(s.op) ?? []), s]);
  return [...byOp.entries()]
    .map(([op, list]) => {
      const ms = list.map((s) => s.ms);
      const errors = list.filter((s) => !s.ok).length;
      return {
        op,
        count: list.length,
        errors,
        errorRate: errors / list.length,
        p50: r1(percentile(ms, 50)),
        p95: r1(percentile(ms, 95)),
        p99: r1(percentile(ms, 99)),
        max: r1(Math.max(...ms)),
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** Requests completed per second, from the first request. */
export function throughput(samples: readonly Sample[], startedAt: number): number[] {
  const out: number[] = [];
  for (const s of samples) {
    const sec = Math.floor((s.at - startedAt) / 1000);
    while (out.length <= sec) out.push(0);
    out[sec]!++;
  }
  return out;
}

export type Check = { name: string; limit: string; actual: string; pass: boolean };

export function evaluate(
  ops: OpSummary[],
  journeys: { started: number; completed: number },
  t: Thresholds,
): Check[] {
  const total = ops.reduce((s, o) => s + o.count, 0);
  const errors = ops.reduce((s, o) => s + o.errors, 0);
  const errorRate = total ? errors / total : 0;
  const completion = journeys.started ? journeys.completed / journeys.started : 1;
  const checks: Check[] = [
    {
      name: 'Error rate',
      limit: `< ${(t.maxErrorRate * 100).toFixed(1)}%`,
      actual: `${(errorRate * 100).toFixed(2)}%`,
      pass: errorRate < t.maxErrorRate,
    },
    {
      name: 'Journeys completed',
      limit: `≥ ${(t.minCompletion * 100).toFixed(0)}%`,
      actual: `${(completion * 100).toFixed(1)}%`,
      pass: completion >= t.minCompletion,
    },
  ];
  for (const o of ops) {
    checks.push(
      {
        name: `${o.op} p95`,
        limit: `< ${t.p95Ms} ms`,
        actual: `${o.p95} ms`,
        pass: (o.p95 ?? 0) < t.p95Ms,
      },
      {
        name: `${o.op} p99`,
        limit: `< ${t.p99Ms} ms`,
        actual: `${o.p99} ms`,
        pass: (o.p99 ?? 0) < t.p99Ms,
      },
    );
  }
  return checks;
}
