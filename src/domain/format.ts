/** Typographic minus (U+2212), used for every negative figure. */
export const MINUS = '−';

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Percent change from `from` to `to`. */
export const pct = (from: number, to: number) => ((to - from) / from) * 100;

/** Signed number: `+4.0`, `−1.8`, or `0.0` (no sign for exact zero). */
export const sgn = (v: number, digits = 1) =>
  (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(digits);

/** `$3.41` */
export const money = (v: number) => '$' + v.toFixed(2);

/** Signed money: `+$5.12`, `−$0.21`. Zero renders as `+$0.00`. */
export const smoney = (v: number) => (v >= 0 ? '+' : MINUS) + '$' + Math.abs(v).toFixed(2);

/** `Oct 26` or `Oct 26, 2026`. */
export const formatDate = (d: Date, withYear = false) =>
  `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ''}`;

/** Local calendar date → `yyyy-mm-dd`. */
export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** `yyyy-mm-dd` → local Date at midnight. */
export const fromISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

/** Calendar date of index `i` in a daily series that starts on `startDate`. */
export const dateAtIndex = (startDate: string, i: number) => {
  const d = fromISODate(startDate);
  d.setDate(d.getDate() + i);
  return d;
};
