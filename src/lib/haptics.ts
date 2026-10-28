import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Light selection tick (scrub snaps, toggles). No-op on web. */
export function selectionTick() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}
