import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { __setErrorReporter, installGlobalErrorHandler, reportError } from '@/lib/errors';
import * as telemetry from '@/lib/telemetry';

describe('error reporting', () => {
  afterEach(() => {
    __setErrorReporter(null);
    jest.restoreAllMocks();
  });

  test('the default reporter sends the error class and context, never the message', () => {
    const track = jest.spyOn(telemetry, 'track').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    reportError(new TypeError('zip 77002 not found'), { where: 'query', key: 'zip' });
    expect(track).toHaveBeenCalledWith('error', { where: 'query', key: 'zip', kind: 'TypeError' });
    expect(JSON.stringify(track.mock.calls)).not.toContain('77002');
  });

  test('a swapped-in reporter receives the error; a failing one never throws', () => {
    const capture = jest.fn();
    __setErrorReporter({ capture });
    const error = new Error('boom');
    reportError(error, { where: 'render' });
    expect(capture).toHaveBeenCalledWith(error, { where: 'render' });

    __setErrorReporter({
      capture: () => {
        throw new Error('reporter down');
      },
    });
    expect(() => reportError(error, { where: 'render' })).not.toThrow();
  });

  test('uncaught errors are reported and still reach React Native’s handler', () => {
    const previous = jest.fn();
    let handler: ((e: unknown, fatal?: boolean) => void) | undefined;
    const g = globalThis as { ErrorUtils?: unknown };
    const saved = g.ErrorUtils;
    g.ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: typeof handler) => (handler = h),
    };
    const capture = jest.fn();
    __setErrorReporter({ capture });
    try {
      installGlobalErrorHandler();
      const error = new Error('fatal');
      handler!(error, true);
      expect(capture).toHaveBeenCalledWith(error, { where: 'global', fatal: true });
      expect(previous).toHaveBeenCalledWith(error, true);
    } finally {
      g.ErrorUtils = saved;
    }
  });
});
