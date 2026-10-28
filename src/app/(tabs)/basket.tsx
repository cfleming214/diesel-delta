import { router } from 'expo-router';
import { Plus } from 'phosphor-react-native';

import { Placeholder } from '@/components/Placeholder';
import { IconButton } from '@/ui';

export default function BasketScreen() {
  return (
    <Placeholder
      title="Basket"
      subtitle="16 items · weighted by purchase frequency"
      phase="Phase 3"
      right={
        <>
          <IconButton
            icon={Plus}
            variant="primary"
            accessibilityLabel="Add item"
            onPress={() => router.push('/search')}
          />
        </>
      }
    />
  );
}
