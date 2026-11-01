export type Verdict = 'gouge' | 'sticky' | 'track';

export const VERDICTS: Record<Verdict, { label: string; tone: 'accent' | 'outline' | 'neutral' }> =
  {
    gouge: { label: 'Gouge Gap', tone: 'accent' },
    sticky: { label: 'Sticky Price', tone: 'outline' },
    track: { label: 'Tracking Fuel', tone: 'neutral' },
  };

export type LedgerTag = 'Fuel-correlated' | 'No fuel link' | 'Partial rollback' | 'Rollback';

/** Diesel must have fallen at least this much (%) since a price rise before a rollback is due. */
export const ROLLBACK_DUE_PCT = -5;

/** One-line explanation under the verdict tag on Item detail. */
export function verdictExplanation(verdict: Verdict, fuelSincePct: number, rises: number): string {
  const moved = Math.abs(fuelSincePct).toFixed(1);
  const times = rises === 1 ? 'once' : rises === 2 ? 'twice' : `${rises} times`;
  switch (verdict) {
    case 'gouge':
      return `Price rose ${times} this year. Diesel has since fallen ${moved}% with no price reduction.`;
    case 'sticky':
      return `Price rose ${times} this year and was only partly reduced after diesel fell ${moved}%.`;
    case 'track':
      if (rises === 0) return 'Price has not risen in the past 12 months.';
      if (fuelSincePct > ROLLBACK_DUE_PCT)
        return `Price rose ${times} this year. Diesel is ${fuelSincePct >= 0 ? 'up' : 'down'} ${moved}% since, so no rollback is due yet.`;
      return 'Price rose and was reduced again as diesel fell.';
  }
}
