/**
 * Load before other application modules so @sentry/node can instrument dependencies.
 * Env: SENTRY_DSN (optional), SENTRY_ENVIRONMENT, SENTRY_TRACES_SAMPLE_RATE (0–1)
 */

const dsn = process.env.SENTRY_DSN || process.env.SENTRY_BACKEND_DSN;
if (dsn && process.env.NODE_ENV !== 'test') {
  // eslint-disable-next-line global-require
  const Sentry = require('@sentry/node');
  const traces = parseFloat(String(process.env.SENTRY_TRACES_SAMPLE_RATE || '0').trim());
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number.isFinite(traces) ? Math.min(Math.max(traces, 0), 1) : 0,
    sendDefaultPii: false,
  });
}
