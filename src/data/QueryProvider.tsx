import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useState, type ReactNode } from 'react';

const HOUR = 60 * 60 * 1000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: HOUR,
        // Keep cached data long enough to open offline with the last values.
        gcTime: 7 * 24 * HOUR,
        retry: 2,
      },
    },
  });
}

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'dd.query-cache' });

/** TanStack Query with the cache persisted to device storage for offline launch. */
export function QueryProvider({
  children,
  client: injected,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  const [client] = useState(() => injected ?? createQueryClient());
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, maxAge: 7 * 24 * HOUR, buster: 'v1' }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
