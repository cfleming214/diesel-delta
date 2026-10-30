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

/** Saves an image file to Photos, asking for add-only access. Returns false if denied. */
export async function saveToPhotos(uri: string): Promise<boolean> {
  const { granted } = await requestPermissionsAsync(true);
  if (!granted) return false;
  await Asset.create(uri);
  return true;
}

/** Opens the native share sheet for an image. Returns false where sharing is unavailable. */
export async function shareImage(uri: string, title: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title, UTI: 'public.png' });
  return true;
}
