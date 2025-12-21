/**
 * Jest Setup
 * 
 * Runs before each test file
 * 
 * @license Apache-2.0
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock server-only module to allow imports in tests
jest.mock('server-only', () => ({}));

// Suppress console errors in tests (optional)
// global.console.error = jest.fn();
// global.console.warn = jest.fn();
