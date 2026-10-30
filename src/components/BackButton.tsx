import { router } from 'expo-router';
import { CaretLeft, X } from '@/ui/icons';

import { IconButton } from '@/ui';

/** 44pt back (pushed screens) or close (modal screens) button for the top-left corner. */
export function BackButton({ close = false }: { close?: boolean }) {
  return (
    <IconButton
      icon={close ? X : CaretLeft}
      accessibilityLabel={close ? 'Close' : 'Back'}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
