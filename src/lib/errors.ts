import { track } from './telemetry';

export type ErrorContext = Record<string, string | number | boolean>;

/**
 * Where unexpected errors go. The default records the error's class and where it happened as an
 * anonymous `error` event (never the message, which can contain user input) and logs it in
 * development. A crash reporter (Sentry) implements this interface at go-live.
 */
export interface ErrorReporter {
  capture(error: unknown, context: ErrorContext): void;
}

const telemetryReporter: ErrorReporter = {
  capture(error, context) {
    const kind = error instanceof Error ? error.name : typeof error;
    track('error', { ...context, kind });
    if (__DEV__) console.warn(`[${String(context.where ?? 'error')}]`, error);
  },
};

let reporter: ErrorReporter = telemetryReporter;

/** Reports an unexpected error. Never throws. */
export function reportError(error: unknown, context: ErrorContext) {
  try {
    reporter.capture(error, context);
  } catch {
    // Reporting must never take the app down with it.
  }
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(h: GlobalHandler): void;
};

/** Reports uncaught JavaScript errors on native, then hands them to React Native's own handler. */
export function installGlobalErrorHandler() {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    reportError(error, { where: 'global', fatal: isFatal ?? false });
    previous(error, isFatal);
  });
}

export function __setErrorReporter(next: ErrorReporter | null) {
  reporter = next ?? telemetryReporter;
}
