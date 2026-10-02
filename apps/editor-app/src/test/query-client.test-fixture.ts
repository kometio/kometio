import { QueryClient } from '@tanstack/react-query';

// No retries in tests: a mocked mutation/query rejection should fail fast,
// not retry into a timeout.
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}
