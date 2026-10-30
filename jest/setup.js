/* global jest */

// Gesture Handler asks Worklets for the UI runtime on a microtask; Jest has no UI runtime.
jest.mock('react-native-worklets', () => ({
  ...jest.requireActual('react-native-worklets'),
  getUIRuntimeHolder: undefined,
}));

require('react-native-gesture-handler/jestSetup');
require('react-native-reanimated').setUpTests();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Quiet default for expo-notifications (its import registers push-token listeners that warn under
// Expo Go detection). Tests that exercise notifications override this with their own mock.
jest.mock('expo-notifications', () => ({
  getLastNotificationResponse: () => null,
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
  scheduleNotificationAsync: async () => 'mock-notification',
}));

// expo-crypto's automock returns undefined; use Node's implementation.
jest.mock('expo-crypto', () => ({ randomUUID: () => require('crypto').randomUUID() }));
