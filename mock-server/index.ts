// Starts the mock backend. Point the app at it with:
//   EXPO_PUBLIC_DATA_SOURCE=supabase EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key
import { createServer } from 'node:http';

import { createMockBackend } from './app';

const port = Number(process.env.MOCK_PORT ?? 54321);
const backend = createMockBackend({
  latencyMs: Number(process.env.MOCK_LATENCY_MS ?? 25),
  jitterMs: Number(process.env.MOCK_JITTER_MS ?? 50),
  errorRate: Number(process.env.MOCK_ERROR_RATE ?? 0),
  ingestSecret: process.env.INGEST_SECRET,
});

void (async () => {
  const ingest = await backend.runIngest();
  const server = createServer((req, res) => void backend.handle(req, res));
  server.listen(port, () => {
    console.log(`mock backend on http://localhost:${port}`);
    console.log(`ingest-eia: ${JSON.stringify(ingest)}`);
  });
})();
