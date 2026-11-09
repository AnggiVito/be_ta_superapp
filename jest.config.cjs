module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js',
    '**/modules/procurement/tests/**/*.test.js',
    '**/modules/reporting/tests/**/*.test.js',
    '!**/modules/reporting/tests/setup.test.js',
  ],
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 10000,
  verbose: true,
};
