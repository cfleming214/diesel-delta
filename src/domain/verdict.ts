export type Verdict = 'gouge' | 'sticky' | 'track';

export const VERDICTS: Record<Verdict, { label: string; tone: 'accent' | 'outline' | 'neutral' }> =
  {
    gouge: { label: 'Gouge Gap', tone: 'accent' },
    sticky: { label: 'Sticky Price', tone: 'outline' },
    track: { label: 'Tracking Fuel', tone: 'neutral' },
  };

export type LedgerTag = 'Fuel-correlated' | 'Partial rollback' | 'Rollback';

/** One-line explanation under the verdict tag on Item detail. */
export function verdictExplanation(verdict: Verdict, fuelSincePct: number): string {
  const fell = Math.abs(fuelSincePct).toFixed(1);
  switch (verdict) {
    case 'gouge':
      return `Price rose twice while diesel climbed. Diesel has since fallen ${fell}% with no price reduction.`;
    case 'sticky':
      return `Price rose with diesel and was only partly reduced after diesel fell ${fell}%.`;
    case 'track':
      return 'Price rose with diesel and was reduced again as diesel fell.';
  }
}
