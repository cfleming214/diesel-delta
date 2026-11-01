import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { supabaseApi } from '@/data/supabaseApi';
import { alignSeries, dateAtIndex } from '@/domain';

const mockRpc = jest.fn<(fn: string, args: object) => Promise<{ data: unknown; error: unknown }>>();
jest.mock('@/data/supabase', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));

const days = (start: string, prices: number[]) =>
  prices.map((p, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { day: d.toISOString().slice(0, 10), price_usd_per_gal: String(p) };
  });

describe('supabaseApi', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  test('getFuelSeries calls fuel_series_daily and converts numeric strings', async () => {
    mockRpc.mockResolvedValue({ data: days('2026-10-24', [3.45, 3.45, 3.41]), error: null });
    const s = await supabaseApi.getFuelSeries('R30', 'diesel');
    expect(mockRpc).toHaveBeenCalledWith('fuel_series_daily', {
      p_area: 'R30',
      p_kind: 'diesel',
      p_days: 449,
    });
    expect(s).toEqual({ startDate: '2026-10-24', values: [3.45, 3.45, 3.41] });
  });

  test('errors and empty series surface as errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(supabaseApi.getFuelSeries('R30', 'diesel')).rejects.toThrow('permission denied');
    mockRpc.mockResolvedValue({ data: [], error: null });
    await expect(supabaseApi.getFuelSeries('SCA', 'diesel')).rejects.toThrow(
      'No fuel prices stored for SCA diesel',
    );
  });

  test('lookupZip reads the current price and date from the ZIP’s diesel series', async () => {
    mockRpc.mockResolvedValue({ data: days('2026-10-24', [5.1, 5.05, 5.02]), error: null });
    const z = await supabaseApi.lookupZip('94110');
    expect(mockRpc.mock.calls[0]![1]).toMatchObject({ p_area: 'SCA', p_kind: 'diesel' });
    expect(z).toMatchObject({ currentDiesel: 5.02, asOf: '2026-10-26', state: { abbr: 'CA' } });
  });

  test('the basket is re-dated to end on the latest diesel observation', async () => {
    mockRpc.mockResolvedValue({ data: days('2026-10-20', [3.5, 3.5, 3.48, 3.47]), error: null });
    const fuel = await supabaseApi.getFuelSeries('NUS', 'diesel');
    const b = await supabaseApi.getBasketSeries(['milk']);
    // Both end on Oct 23, so aligning them keeps the basket's last (today's Search) price.
    const aligned = alignSeries(fuel, b)!;
    expect(dateAtIndex(aligned.startDate, aligned.a.length - 1)).toEqual(new Date(2026, 9, 23));
    expect(aligned.b.at(-1)).toBe(b.values.at(-1));
    expect(mockRpc.mock.calls.at(-1)![1]).toMatchObject({ p_area: 'NUS', p_kind: 'diesel' });
  });

  test('grocery data still comes from fixtures', async () => {
    expect((await supabaseApi.getItem('milk', 'gulf')).name).toBe('Whole milk');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
