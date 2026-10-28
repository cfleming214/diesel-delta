import { router } from 'expo-router';
import { MagnifyingGlass, ShareNetwork } from 'phosphor-react-native';

import { Placeholder } from '@/components/Placeholder';
import { IconButton } from '@/ui';

export default function TodayScreen() {
  return (
    <Placeholder
      title="Today"
      subtitle="TX 77002 · Oct 26, 2026"
      phase="Phase 2"
      right={
        <>
          <IconButton
            icon={MagnifyingGlass}
            accessibilityLabel="Search"
            onPress={() => router.push('/search')}
          />
          <IconButton
            icon={ShareNetwork}
            accessibilityLabel="Share"
            onPress={() => router.push('/share')}
          />
        </>
      }
    />
  );
}
