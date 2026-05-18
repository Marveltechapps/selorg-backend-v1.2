/**
 * Jest Configuration
 * File: jest.config.js
 *
 * Test runner configuration for Phase 1 testing
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/core/app.js',
    '!src/server.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  verbose: true,
  bail: false,
  detectOpenHandles: true,
  forceExit: true,
  logHeapUsage: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
