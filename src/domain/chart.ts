import { gridValues, indexWindow, paddedRange, scaleLinear } from './series';

export type LagChartInput = {
  fuel: readonly number[];
  basket: readonly number[];
  start: number;
  end: number;
  /** Shift the fuel series forward by this many days. */
  lagDays?: number;
  width: number;
  height: number;
};

export type LagChartGeometry = {
  /** Number of daily points in the window. */
  count: number;
  fuelIndex: number[];
  basketIndex: number[];
  xs: number[];
  fuelYs: number[];
  basketYs: number[];
  fuelPath: string;
  basketPath: string;
  /** Closed area between the two series. */
  gapPath: string;
  grid: { y: number; label: string }[];
};

/** Geometry for the dual-series chart, both series indexed to 100 at the window start. */
export function lagChartGeometry({
  fuel,
  basket,
  start,
  end,
  lagDays = 0,
  width,
  height,
}: LagChartInput): LagChartGeometry {
  const { fuel: fi, basket: bi } = indexWindow(fuel, basket, start, end, lagDays);
  const count = fi.length;
  const { lo, hi } = paddedRange(fi, bi);
  const x = scaleLinear(0, count - 1, 0, width);
  const y = scaleLinear(lo, hi, height, 0);
  const xs = fi.map((_, i) => x(i));
  const fuelYs = fi.map(y);
  const basketYs = bi.map(y);
  const pt = (i: number, ys: number[]) => `${xs[i]!.toFixed(1)} ${ys[i]!.toFixed(1)}`;
  const path = (ys: number[]) => ys.map((_, i) => (i ? 'L' : 'M') + pt(i, ys)).join('');
  let back = '';
  for (let i = count - 1; i >= 0; i--) back += 'L' + pt(i, fuelYs);
  return {
    count,
    fuelIndex: fi,
    basketIndex: bi,
    xs,
    fuelYs,
    basketYs,
    fuelPath: path(fuelYs),
    basketPath: path(basketYs),
    gapPath: path(basketYs) + back + 'Z',
    grid: gridValues(lo, hi).map((g) => ({ y: y(g), label: String(g) })),
  };
}
