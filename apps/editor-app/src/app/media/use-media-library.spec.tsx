import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../lib/media-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { useMediaLibrary } from './use-media-library';

vi.mock('../../lib/media-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/media-api-client')>();
  return { ...actual, deleteMedia: vi.fn() };
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('useMediaLibrary', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deleteMedia removes the given media', async () => {
    vi.mocked(api.deleteMedia).mockResolvedValue(undefined);

    const { result } = renderHook(() => useMediaLibrary('site-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.deleteMedia('media-1');
    });

    expect(api.deleteMedia).toHaveBeenCalledWith('media-1');
  });
});
