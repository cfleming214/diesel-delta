import { useLocalSearchParams } from 'expo-router';

import { Placeholder } from '@/components/Placeholder';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Placeholder title="Item" subtitle={id} nav="push" phase="Phase 3" />;
}
