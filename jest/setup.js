/* global jest */

// Gesture Handler asks Worklets for the UI runtime on a microtask; Jest has no UI runtime.
jest.mock('react-native-worklets', () => ({
  ...jest.requireActual('react-native-worklets'),
  getUIRuntimeHolder: undefined,
}));

require('react-native-gesture-handler/jestSetup');
require('react-native-reanimated').setUpTests();
