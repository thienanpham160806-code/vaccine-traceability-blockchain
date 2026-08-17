// Jest setup file
jest.setTimeout(10000);

// Set test environment variables before any imports
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.NODE_ENV = 'test';

// Suppress console logs during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  };
}
