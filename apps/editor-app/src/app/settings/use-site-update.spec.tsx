import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import type { SiteRecord } from '@kometio/api-contracts';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { siteQueryOptions } from './site-queries';
import { useSiteUpdate } from './use-site-update';

describe('useSiteUpdate', () => {
  it('sends the input for this site, and puts the site it answers with in the cache', async () => {
    const queryClient = createTestQueryClient();
    const saved = buildSiteRecord({ name: 'Forno Rossi' });
    const update = vi.fn(
      async (_siteId: string, _input: { name: string }): Promise<SiteRecord> =>
        saved,
    );
    const { result } = renderHook(() => useSiteUpdate('site-1', update), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.save({ name: 'Forno Rossi' });
    });

    expect(update).toHaveBeenCalledWith('site-1', { name: 'Forno Rossi' });
    expect(queryClient.getQueryData(siteQueryOptions().queryKey)).toEqual(
      saved,
    );
  });
});
