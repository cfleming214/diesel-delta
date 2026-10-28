import { router } from 'expo-router';

import { Placeholder } from '@/components/Placeholder';
import { Button } from '@/ui';

export default function InsightsScreen() {
  return (
    <Placeholder
      title="Insights"
      phase="Phase 5"
      right={
        <Button label="Retailers" variant="secondary" onPress={() => router.push('/retailers')} />
      }
    />
  );
}
