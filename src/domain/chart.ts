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

export type ItemChartInput = {
  weeklyPrice: readonly number[];
  weeklyFuel: readonly number[];
  changeWeeks: readonly number[];
  fuelFallingWeeks: readonly [number, number];
  width: number;
  height: number;
};

export type ItemChartGeometry = {
  /** Step line: price holds flat until each change. */
  pricePath: string;
  fuelPath: string;
  band: { x: number; width: number };
  /** Hollow markers at each price change (the new price). */
  marks: { x: number; y: number }[];
  price: { lo: number; hi: number };
  fuel: { lo: number; hi: number };
};

/** 12-month item chart: price and fuel on independent axes with a 12pt vertical inset. */
export function itemChartGeometry({
  weeklyPrice,
  weeklyFuel,
  changeWeeks,
  fuelFallingWeeks,
  width,
  height,
}: ItemChartInput): ItemChartGeometry {
  const weeks = weeklyPrice.length - 1;
  const x = (w: number) => (w / weeks) * width;
  const pl = Math.min(...weeklyPrice);
  const ph = Math.max(...weeklyPrice);
  const fl = Math.min(...weeklyFuel);
  const fh = Math.max(...weeklyFuel);
  const yP = (v: number) => height - 12 - ((v - pl) / (ph - pl || 1)) * (height - 24);
  const yF = (v: number) => height - 12 - ((v - fl) / (fh - fl || 1)) * (height - 24);
  const f1 = (n: number) => n.toFixed(1);

  let pricePath = `M0 ${f1(yP(weeklyPrice[0]!))}`;
  for (let w = 1; w <= weeks; w++) {
    pricePath += `L${f1(x(w))} ${f1(yP(weeklyPrice[w - 1]!))}L${f1(x(w))} ${f1(yP(weeklyPrice[w]!))}`;
  }
  const fuelPath = weeklyFuel.map((v, w) => `${w ? 'L' : 'M'}${f1(x(w))} ${f1(yF(v))}`).join('');
  const [b0, b1] = fuelFallingWeeks;

  return {
    pricePath,
    fuelPath,
    band: { x: x(b0), width: x(b1) - x(b0) },
    marks: changeWeeks.map((w) => ({ x: x(w), y: yP(weeklyPrice[w]!) })),
    price: { lo: pl, hi: ph },
    fuel: { lo: fl, hi: fh },
  };
}
