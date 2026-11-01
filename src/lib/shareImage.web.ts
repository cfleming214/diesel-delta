// Web versions of the share-card actions. The native ones (shareImage.ts) write a temp file and
// use the photo library and share sheet, none of which exist in a browser.
import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { SaveResult, ShareResult } from './shareImage';

const FILE_NAME = 'diesel-data-share.png';

/** Renders a view to a PNG data URI at an exact pixel size (html2canvas-pro under the hood). */
export async function captureCard(
  view: RefObject<HostInstance | null>,
  size: { width: number; height: number },
) {
  return captureRef(view, { format: 'png', quality: 1, result: 'data-uri', ...size });
}

/** Downloads the image as a PNG file. */
export async function saveImage(uri: string): Promise<SaveResult> {
  const a = document.createElement('a');
  a.href = uri;
  a.download = FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'downloaded';
}

/**
 * Shares the image with the browser's share sheet where it can take files (mobile browsers);
 * otherwise copies the card's link to the clipboard.
 */
export async function shareImage(uri: string, title: string, link: string): Promise<ShareResult> {
  const blob = await (await fetch(uri)).blob();
  const file = new File([blob], FILE_NAME, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, url: link });
      return 'shared';
    } catch (e) {
      // Closing the share sheet is not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(link);
    return 'copied';
  }
  return 'unavailable';
}
