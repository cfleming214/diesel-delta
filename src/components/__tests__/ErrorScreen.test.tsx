import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ErrorScreen } from '@/components/ErrorScreen';
import { __setErrorReporter } from '@/lib/errors';

describe('ErrorScreen', () => {
  afterEach(() => __setErrorReporter(null));

  test('reports the error once and retries on request', async () => {
    const capture = jest.fn();
    __setErrorReporter({ capture });
    const retry = jest.fn(async () => {});
    const error = new Error('render failed');
    await render(<ErrorScreen error={error} retry={retry} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(error, { where: 'render' });
    await fireEvent.press(screen.getByText('Try again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
