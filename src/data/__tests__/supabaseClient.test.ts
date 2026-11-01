import { afterEach, describe, expect, jest, test } from '@jest/globals';

describe('getSupabase', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.resetModules();
  });

  test('calls PostgREST with the anon key as apikey and Bearer token', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const calls: { url: string; headers: Headers; body?: unknown }[] = [];
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers), body: init?.body });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const realFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSupabase } = require('@/data/supabase') as typeof import('@/data/supabase');
      await getSupabase().rpc('fuel_series_daily', { p_area: 'NUS', p_kind: 'diesel', p_days: 3 });
      await getSupabase()
        .from('app_events')
        .insert([{ name: 'app_open' }]);
    } finally {
      global.fetch = realFetch;
    }
    expect(calls[0]!.url).toBe('https://example.supabase.co/rest/v1/rpc/fuel_series_daily');
    expect(calls[1]!.url).toMatch(/^https:\/\/example\.supabase\.co\/rest\/v1\/app_events\?/);
    for (const c of calls) {
      expect(c.headers.get('apikey')).toBe('anon-key');
      expect(c.headers.get('authorization')).toBe('Bearer anon-key');
    }
  });
});
