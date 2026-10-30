import assert from 'node:assert/strict';

import { type AdminDb, createAdminHandler } from './handler.ts';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const db: AdminDb = {
  eventsSince: async () => [
    {
      install_id: 'a',
      session_id: 's',
      name: 'app_open',
      props: {},
      platform: 'ios',
      occurred_at: '2026-10-30T11:59:00Z',
      received_at: '2026-10-30T11:59:00Z',
    },
  ],
  recentRuns: async () => [],
};

Deno.test('requires the admin token and serves a snapshot without API fields', async () => {
  const handle = createAdminHandler({ db, adminToken: 'secret', now: () => NOW });
  assert.equal((await handle(new Request('http://x/admin-metrics'))).status, 401);
  assert.equal((await handle(new Request('http://x', { method: 'OPTIONS' }))).status, 204);
  const res = await handle(
    new Request('http://x/admin-metrics', { headers: { 'x-admin-token': 'secret' } }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.kpis.activeNow, 1);
  assert.equal(body.kpis.apiP95Ms, null);
  assert.equal(body.routes, null);
});

Deno.test('an empty ADMIN_TOKEN never authorizes', async () => {
  const handle = createAdminHandler({ db, adminToken: '' });
  const res = await handle(new Request('http://x', { headers: { 'x-admin-token': '' } }));
  assert.equal(res.status, 401);
});
