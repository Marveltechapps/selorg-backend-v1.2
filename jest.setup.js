/**
 * Jest Setup File
 * File: jest.setup.js
 *
 * Global setup for all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-minimum-32-characters-long-here';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-minimum-32-characters-here';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.MONGODB_URI = 'mongodb://localhost:27017/selorg-test';

// Suppress console output in tests
global.console.log = jest.fn();
global.console.warn = jest.fn();
global.console.error = jest.fn();

// Allow console.error in tests (for debugging)
const originalError = console.error;
beforeAll(() => {
  console.error = originalError;
});
