import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, Screen, Seg, Stepper, Tag, Text, Toggle } from '@/ui';

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 54, left: 0, right: 0, bottom: 34 },
};

describe('Seg', () => {
  test('marks the selected option and reports changes', async () => {
    const onChange = jest.fn();
    await render(
      <Seg
        value={90}
        onChange={onChange}
        options={[
          { value: 30, label: '30D' },
          { value: 90, label: '90D' },
        ]}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[1]?.props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByText('30D'));
    expect(onChange).toHaveBeenCalledWith(30);
  });
});

describe('Toggle', () => {
  test('flips its value', async () => {
    const onChange = jest.fn();
    await render(<Toggle value={false} onChange={onChange} accessibilityLabel="Alert" />);
    await fireEvent.press(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Stepper', () => {
  test('clamps to min and max', async () => {
    const onChange = jest.fn();
    await render(
      <Stepper value={15} min={1} max={15} onChange={onChange} accessibilityLabel="Tolerance" />,
    );
    await fireEvent.press(screen.getByLabelText('Increase'));
    expect(onChange).toHaveBeenLastCalledWith(15);
    await fireEvent.press(screen.getByLabelText('Decrease'));
    expect(onChange).toHaveBeenLastCalledWith(14);
  });
});

describe('Button', () => {
  test('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Screen', () => {
  test('renders children inside the safe area', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Screen>
          <Text>Body</Text>
          <Tag label="Gouge Gap" tone="accent" />
        </Screen>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Gouge Gap')).toBeTruthy();
  });
});
