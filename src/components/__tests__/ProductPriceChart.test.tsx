import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProductPriceChart } from '@/components/ProductPriceChart';

const series = [
  { retailer: 'Walmart', values: [3.89, 3.89, 3.89] },
  { retailer: 'Amazon', values: [4.49, 4.69, 4.69] },
  { retailer: 'Kroger', values: [4.69, 4.99, 4.99] },
];

describe('ProductPriceChart', () => {
  test('labels each line and the lowest and highest prices', async () => {
    await render(
      <ProductPriceChart
        series={series}
        index={null}
        onIndexChange={jest.fn()}
        accessibilityLabel="Whole milk price over 90 days"
      />,
    );
    await fireEvent(screen.getByLabelText('Whole milk price over 90 days'), 'layout', {
      nativeEvent: { layout: { width: 340, height: 220 } },
    });
    for (const name of ['Walmart', 'Amazon', 'Kroger']) expect(screen.getByText(name)).toBeTruthy();
    // The axis runs from the cheapest line to the dearest, both labelled.
    expect(screen.getByText('$3.89')).toBeTruthy();
    expect(screen.getByText('$4.44')).toBeTruthy();
    expect(screen.getByText('$4.99')).toBeTruthy();
  });

  test('labels of lines that end close together don’t overlap', async () => {
    await render(
      <ProductPriceChart
        series={[
          { retailer: 'Walmart', values: [3.79, 3.79] },
          { retailer: 'Amazon', values: [3.79, 3.79] },
          { retailer: 'Kroger', values: [3.59, 3.59] },
        ]}
        index={null}
        onIndexChange={jest.fn()}
        accessibilityLabel="chart"
      />,
    );
    await fireEvent(screen.getByLabelText('chart'), 'layout', {
      nativeEvent: { layout: { width: 340, height: 220 } },
    });
    const tops = ['Walmart', 'Amazon', 'Kroger']
      .map((n) => {
        const style = [screen.getByText(n).props.style].flat(Infinity) as { top?: number }[];
        return style.find((st) => st && st.top != null)!.top!;
      })
      .sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++)
      expect(tops[i]! - tops[i - 1]!).toBeGreaterThanOrEqual(14);
  });
});
