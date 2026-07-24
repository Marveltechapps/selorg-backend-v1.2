/**
 * Production must never redirect payment cancel/success/fail to localhost,
 * even when WORLDLINE_* env vars are still pointing at a developer machine.
 */
const {
  isLocalOrPrivateHost,
  resolveWebAppBaseUrl,
  resolveWorldlineApiReturnUrl,
  resolveReturnUrlForPlatform,
  PRODUCTION_WEB_APP_URL,
  PRODUCTION_API_RETURN_URL,
} = require('../../src/customer-backend/utils/paymentRedirectUrls');

describe('paymentRedirectUrls', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('isLocalOrPrivateHost detects localhost and private IPs', () => {
    expect(isLocalOrPrivateHost('http://localhost:5173')).toBe(true);
    expect(isLocalOrPrivateHost('http://127.0.0.1:3333/api')).toBe(true);
    expect(isLocalOrPrivateHost('http://192.168.1.5:5173')).toBe(true);
    expect(isLocalOrPrivateHost('https://www.selorg.com')).toBe(false);
    expect(isLocalOrPrivateHost('https://api.selorg.com/api/v1/customer/payments/worldline/return')).toBe(
      false
    );
  });

  test('production ignores localhost WORLDLINE_WEB_APP_URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.WORLDLINE_WEB_APP_URL = 'http://localhost:5173';
    process.env.CUSTOMER_WEB_URL = '';
    process.env.FRONTEND_URL = '';

    expect(resolveWebAppBaseUrl()).toBe(PRODUCTION_WEB_APP_URL);
    expect(resolveReturnUrlForPlatform('web')).toBe(`${PRODUCTION_WEB_APP_URL}/paynimo-return.html`);
  });

  test('production ignores localhost WORLDLINE_RETURN_URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.WORLDLINE_RETURN_URL = 'http://localhost:3333/api/v1/customer/payments/worldline/return';
    process.env.API_BASE_URL = 'https://api.selorg.com';

    expect(resolveWorldlineApiReturnUrl()).toBe(
      'https://api.selorg.com/api/v1/customer/payments/worldline/return'
    );
    expect(resolveReturnUrlForPlatform('android')).toBe(
      'https://api.selorg.com/api/v1/customer/payments/worldline/return'
    );
  });

  test('production uses hosted frontend URL when configured correctly', () => {
    process.env.NODE_ENV = 'production';
    process.env.WORLDLINE_WEB_APP_URL = 'https://www.selorg.com';
    process.env.WORLDLINE_RETURN_URL =
      'https://api.selorg.com/api/v1/customer/payments/worldline/return';

    expect(resolveWebAppBaseUrl()).toBe('https://www.selorg.com');
    expect(resolveReturnUrlForPlatform('web')).toBe('https://www.selorg.com/paynimo-return.html');
    expect(resolveWorldlineApiReturnUrl()).toBe(PRODUCTION_API_RETURN_URL);
  });

  test('development still allows localhost for local Paynimo testing', () => {
    process.env.NODE_ENV = 'development';
    process.env.WORLDLINE_WEB_APP_URL = 'http://localhost:5173';
    process.env.WORLDLINE_RETURN_URL =
      'http://localhost:3333/api/v1/customer/payments/worldline/return';
    delete process.env.API_BASE_URL;
    delete process.env.DIDIT_WEBHOOK_BASE_URL;
    delete process.env.PUBLIC_API_URL;
    delete process.env.CUSTOMER_WEB_URL;
    delete process.env.FRONTEND_URL;

    expect(resolveWebAppBaseUrl()).toBe('http://localhost:5173');
    expect(resolveReturnUrlForPlatform('web')).toBe('http://localhost:5173/paynimo-return.html');
    expect(resolveWorldlineApiReturnUrl()).toBe(
      'http://localhost:3333/api/v1/customer/payments/worldline/return'
    );
  });

  test('hosted API with NODE_ENV=development never falls back to localhost', () => {
    // Matches the AWS misconfig: NODE_ENV left as development, return URL hosted,
    // but WORLDLINE_WEB_APP_URL missing → previously defaulted to localhost:5173.
    process.env.NODE_ENV = 'development';
    delete process.env.WORLDLINE_WEB_APP_URL;
    delete process.env.CUSTOMER_WEB_URL;
    delete process.env.FRONTEND_URL;
    process.env.WORLDLINE_RETURN_URL =
      'https://api.selorg.com/api/v1/customer/payments/worldline/return';

    expect(resolveWebAppBaseUrl()).toBe(PRODUCTION_WEB_APP_URL);
    expect(resolveReturnUrlForPlatform('web')).toBe(
      `${PRODUCTION_WEB_APP_URL}/paynimo-return.html`
    );
  });

  test('hosted API ignores localhost WORLDLINE_WEB_APP_URL even when NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';
    process.env.WORLDLINE_WEB_APP_URL = 'http://localhost:5173';
    process.env.CUSTOMER_WEB_URL = '';
    process.env.FRONTEND_URL = '';
    process.env.WORLDLINE_RETURN_URL =
      'https://api.selorg.com/api/v1/customer/payments/worldline/return';

    expect(resolveWebAppBaseUrl()).toBe(PRODUCTION_WEB_APP_URL);
    expect(resolveReturnUrlForPlatform('web')).toBe(
      `${PRODUCTION_WEB_APP_URL}/paynimo-return.html`
    );
  });
});
