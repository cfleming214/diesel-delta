import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Renders a view to a PNG file at an exact pixel size. */
export async function captureCard(
  view: RefObject<HostInstance | null>,
  size: { width: number; height: number },
) {
  return captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', ...size });
}

/** Where a saved image went (the web build downloads it instead), or why it couldn't be saved. */
export type SaveResult = 'photos' | 'downloaded' | 'denied';
/** What sharing did: opened a share sheet, copied the link instead (web), or neither. */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

/** Saves an image file to Photos, asking for add-only access. */
export async function saveImage(uri: string): Promise<SaveResult> {
  const { granted } = await requestPermissionsAsync(true);
  if (!granted) return 'denied';
  await Asset.create(uri);
  return 'photos';
}

/** Opens the native share sheet for an image. `link` is used only by the web fallback. */
export async function shareImage(uri: string, title: string, _link: string): Promise<ShareResult> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
  return 'shared';
}
