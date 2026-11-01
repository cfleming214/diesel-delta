import type { PriceChange } from '@/data';
import { sgn } from '@/domain';

export const CHANGE_LABELS: [keyof PriceChange, string][] = [
  ['d30', '30D'],
  ['d90', '90D'],
  ['d365', '1Y'],
];

/** `+1.2%`, `−0.4%`, or an en dash without history. */
export const formatChange = (v: number | null) => (v == null ? '–' : `${sgn(v)}%`);

/** "30 days +1.2%, 90 days −0.4%, 1 year +12.0%" for screen readers. */
export function describeChange(c: PriceChange) {
  const words: Record<keyof PriceChange, string> = {
    d30: '30 days',
    d90: '90 days',
    d365: '1 year',
  };
  return CHANGE_LABELS.map(([k]) => `${words[k]} ${formatChange(c[k])}`).join(', ');
}

/** Line colors and dashes per retailer: validated categorical steps for a dark ground. */
export const RETAILER_STYLE: Record<string, { color: string; dash: string }> = {
  Kroger: { color: '#3987e5', dash: '' },
  Walmart: { color: '#d95926', dash: '6 4' },
  Amazon: { color: '#199e70', dash: '2 3' },
};
