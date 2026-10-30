// Price bot CLI.
//
//   npm run bot -- run [--day 2026-10-30] [--sources mock-kroger,...] [--discover] [--dry-run]
//   npm run bot -- simulate --days 30 [--end 2026-10-30]
//
// Targets SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY; both default to the local mock server
// (npm run mock:server). --dry-run starts an in-process mock server instead, so nothing outside
// this process is touched. `simulate` replays past days against the mock retailers only.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createMockBackend } from '../mock-server/app';
import { mockAdapter } from './adapters/mock';
import type { SourceAdapter } from './adapters/types';
import { loadCatalog } from './catalog';
import { type BotDb, createBotDb } from './db';
import { createPoliteHttp } from './http';
import { runDay, type RunSummary } from './pipeline';
import { fileRawStore } from './raw';

const MOCK_URL = 'http://localhost:54321';
const MOCK_SERVICE_KEY = 'mock-service-role-key';

export function userAgent(contactUrl: string) {
  return `DieselDeltaPriceBot/0.1 (+${contactUrl})`;
}

/** Adapters available in this build. Real sources (kroger-api, ...) arrive in P3 and P4. */
export function buildAdapters(baseUrl: string, only?: string[]): SourceAdapter[] {
  const all = (['kroger', 'walmart', 'amazon'] as const).map((retailerId) =>
    mockAdapter({ retailerId, baseUrl }),
  );
  return only ? all.filter((a) => only.includes(a.sourceId)) : all;
}

export function createBot(opts: {
  url: string;
  serviceKey: string;
  contactUrl: string;
  rawDir: string;
}) {
  const db = createBotDb(opts.url, opts.serviceKey);
  const raw = fileRawStore(opts.rawDir);
  const http = createPoliteHttp({
    userAgent: userAgent(opts.contactUrl),
    isEnabled: (id) => db.isEnabled(id),
    raw,
  });
  return { db, http, raw };
}

export function formatSummary(s: RunSummary): string {
  const lines = [
    `${s.day}  run ${s.runId}  ${s.status}  coverage ${s.coverage.filled}/${s.coverage.possible} (${s.coverage.pct}%)  size changes ${s.sizeChanges}  ${(s.durationMs / 1000).toFixed(1)} s`,
  ];
  for (const [id, x] of Object.entries(s.sources)) {
    lines.push(
      `  ${id.padEnd(14)} tasks ${x.tasks - x.failedTasks}/${x.tasks}  published ${x.published}  held ${x.held}  promos ${x.promos}  out of stock ${x.outOfStock}${x.blocked ? `  BLOCKED: ${x.blocked}` : ''}`,
    );
  }
  return lines.join('\n');
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Starts a mock backend inside this process; returns its URL and a stop function. */
export async function startInProcessMock() {
  const backend = createMockBackend();
  const server = createServer((req, res) => void backend.handle(req, res));
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    backend,
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

/** Refuses to simulate unless every source that would run is a mock retailer. */
async function assertMockOnly(db: BotDb, adapters: SourceAdapter[]) {
  const rows = await db.sources();
  const bad = adapters.filter((a) => rows.find((r) => r.id === a.sourceId)?.kind !== 'mock');
  if (bad.length)
    throw new Error(
      `simulate only runs mock sources; refusing ${bad.map((a) => a.sourceId).join(', ')}`,
    );
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      day: { type: 'string' },
      days: { type: 'string' },
      end: { type: 'string' },
      sources: { type: 'string' },
      discover: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      workers: { type: 'string' },
    },
  });
  const command = positionals[0] ?? 'run';
  const mock = values['dry-run'] ? await startInProcessMock() : null;
  const url = mock?.url ?? process.env.SUPABASE_URL ?? MOCK_URL;
  const serviceKey = mock
    ? MOCK_SERVICE_KEY
    : (process.env.SUPABASE_SERVICE_ROLE_KEY ?? MOCK_SERVICE_KEY);
  const contactUrl = process.env.BOT_CONTACT_URL ?? 'https://dd.app/bot';
  const { db, http, raw } = createBot({
    url,
    serviceKey,
    contactUrl,
    rawDir: process.env.BOT_RAW_DIR ?? join(__dirname, '.data', 'raw'),
  });
  const adapters = buildAdapters(process.env.MOCK_RETAIL_URL ?? url, values.sources?.split(','));
  const items = loadCatalog();
  const workers = values.workers ? Number(values.workers) : undefined;
  const log = (m: string) => console.log(m);

  try {
    if (command === 'run') {
      const s = await runDay({
        db,
        http,
        adapters,
        items,
        day: values.day ?? today(),
        discover: values.discover,
        workers,
        log,
      });
      console.log(formatSummary(s));
    } else if (command === 'simulate') {
      await assertMockOnly(db, adapters);
      const days = Number(values.days ?? 30);
      const end = values.end ?? today();
      for (let i = days - 1; i >= 0; i--) {
        const s = await runDay({
          db,
          http,
          adapters,
          items,
          day: addDays(end, -i),
          discover: i === days - 1 && values.discover,
          workers,
        });
        console.log(formatSummary(s));
      }
    } else {
      throw new Error(`unknown command "${command}" (use run or simulate)`);
    }
    console.log(
      `requests ${http.counts.requests}, retries ${http.counts.retries}, raw responses purged ${await raw.purge()}`,
    );
  } finally {
    await mock?.stop();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
