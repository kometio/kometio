import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildPageTranslationRecord } from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { pageGroupTranslationsQueryOptions } from './page-groups-queries';
import { usePageGroupTranslations } from './use-page-group-translations';

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return { ...actual, createPageGroupTranslation: vi.fn() };
});

const enTranslation = buildPageTranslationRecord({
  id: 'translation-en',
  locale: 'en',
});

function renderWithClient(
  existing: api.PageTranslationRecord[] = [enTranslation],
) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    pageGroupTranslationsQueryOptions('group-1').queryKey,
    existing,
  );
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { wrapper, queryClient };
}

describe('usePageGroupTranslations', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a translation for a new locale and appends it to the cached list', async () => {
    const created: api.PageTranslationRecord = {
      ...enTranslation,
      id: 'translation-it',
      locale: 'it',
      slug: 'home-it',
    };
    vi.mocked(api.createPageGroupTranslation).mockResolvedValue(created);
    const { wrapper, queryClient } = renderWithClient();

    const { result } = renderHook(() => usePageGroupTranslations('group-1'), {
      wrapper,
    });

    await act(async () => {
      await result.current.createTranslation({ locale: 'it', slug: 'home-it' });
    });

    expect(api.createPageGroupTranslation).toHaveBeenCalledWith('group-1', {
      locale: 'it',
      slug: 'home-it',
      seoMeta: { title: '', description: '' },
    });
    expect(
      queryClient.getQueryData(
        pageGroupTranslationsQueryOptions('group-1').queryKey,
      ),
    ).toEqual([enTranslation, created]);
  });
});
