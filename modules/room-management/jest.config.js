export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  rootDir: '../..',
  testMatch: [
    '**/modules/room-management/testing/**/*.test.js'
  ],
  collectCoverageFrom: [
    'modules/room-management/**/*.js',
    '!**/node_modules/**',
    '!**/testing/**',
    '!**/scripts/**',
    '!**/migrations/**',
    '!**/jest.config.js'
  ],
  coverageDirectory: 'modules/room-management/testing/coverage',
  verbose: true,
  testTimeout: 30000, // 30 seconds for API calls
};
