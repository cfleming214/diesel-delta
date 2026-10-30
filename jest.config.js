const { transformIgnorePatterns } = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  resolver: 'react-native-reanimated/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/jest/setup.js'],
  // src/ui/icons.ts loads phosphor's per-icon TSX source, which needs transforming.
  transformIgnorePatterns: transformIgnorePatterns.map((p) =>
    p.replace('(?!(', '(?!(phosphor-react-native|'),
  ),
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
