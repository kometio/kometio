import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  buildPageGroupListItemRecord,
  buildPageTranslationRecord,
} from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { useRepresentativePage } from './use-representative-page';

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    listPageGroups: vi.fn(),
    listPageGroupTranslations: vi.fn(),
  };
});

function renderWithClient() {
  const queryClient = createTestQueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { wrapper };
}

describe('useRepresentativePage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the first matching-locale translation of the first group', async () => {
    vi.mocked(api.listPageGroups).mockResolvedValue({
      items: [buildPageGroupListItemRecord({ id: 'group-1' })],
      total: 1,
    });
    vi.mocked(api.listPageGroupTranslations).mockResolvedValue([
      buildPageTranslationRecord({ id: 'it-translation-1', locale: 'it' }),
      buildPageTranslationRecord({ id: 'it-translation-2', locale: 'it' }),
    ]);
    const { wrapper } = renderWithClient();

    const { result } = renderHook(() => useRepresentativePage('site-1', 'it'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.page?.id).toBe('it-translation-1');
    expect(api.listPageGroupTranslations).toHaveBeenCalledWith('group-1');
  });

  it('returns null when no group has a translation in that locale', async () => {
    vi.mocked(api.listPageGroups).mockResolvedValue({ items: [], total: 0 });
    const { wrapper } = renderWithClient();

    const { result } = renderHook(() => useRepresentativePage('site-1', 'it'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.page).toBeNull();
    expect(api.listPageGroupTranslations).not.toHaveBeenCalled();
  });
});
