import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { TabBar } from '@/components/TabBar';

type Props = ComponentProps<typeof TabBar>;

const routes = ['index', 'chart', 'basket', 'log', 'insights'].map((name) => ({
  key: `${name}-key`,
  name,
}));

function setup(defaultPrevented = false) {
  const emit = jest.fn(() => ({ defaultPrevented }));
  const navigateToTab = jest.fn();
  const props = {
    state: { index: 0, routes },
    emitter: { emit },
    navigateToTab,
    insets: { top: 54, bottom: 34, left: 0, right: 0 },
  } as unknown as Props;
  return { props, emit, navigateToTab };
}

describe('TabBar', () => {
  test('renders the five tabs with Today selected', async () => {
    const { props } = setup();
    await render(<TabBar {...props} />);
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual([
      'Today',
      'Chart',
      'Basket',
      'Log',
      'Insights',
    ]);
    expect(screen.getByLabelText('Today').props.accessibilityState).toEqual({ selected: true });
  });

  test('navigates on press unless the event is prevented', async () => {
    const a = setup();
    await render(<TabBar {...a.props} />);
    await fireEvent.press(screen.getByLabelText('Chart'));
    expect(a.navigateToTab).toHaveBeenCalledWith('chart-key');

    const b = setup(true);
    await render(<TabBar {...b.props} />);
    await fireEvent.press(screen.getByLabelText('Log'));
    expect(b.navigateToTab).not.toHaveBeenCalled();
  });

  test('pressing the focused tab does not navigate', async () => {
    const { props, navigateToTab, emit } = setup();
    await render(<TabBar {...props} />);
    await fireEvent.press(screen.getByLabelText('Today'));
    expect(emit).toHaveBeenCalled();
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
