import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import { buildPageGroupRecord } from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { usePageGroupsList } from './use-page-groups-list';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    createPageGroup: vi.fn(),
    createPageGroupTranslation: vi.fn(),
    deletePageGroup: vi.fn(),
    duplicatePageGroup: vi.fn(),
    reorderPageGroups: vi.fn(),
  };
});

const sampleGroup = buildPageGroupRecord();

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('usePageGroupsList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('createPageGroup creates the page and its default-locale translation in one request, and opens the editor', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    vi.mocked(api.createPageGroup).mockResolvedValue(sampleGroup);

    const { result } = renderHook(() => usePageGroupsList('site-1', 'it'), {
      wrapper,
    });

    await act(async () => {
      await result.current.createPageGroup({
        name: 'Chi Siamo',
        templateId: null,
        parentId: null,
      });
    });

    expect(api.createPageGroup).toHaveBeenCalledWith({
      siteId: 'site-1',
      collectionId: null,
      parentId: null,
      translation: {
        locale: 'it',
        slug: 'chi-siamo',
        seoMeta: { title: 'Chi Siamo', description: '' },
      },
    });
    // Never a second request that could fail after the page exists.
    expect(api.createPageGroupTranslation).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/page-groups/$groupId',
        params: { groupId: sampleGroup.id },
      }),
    );
  });

  it('createPageGroup starts from the chosen template, in the collection it was created in', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.createPageGroup).mockResolvedValue(sampleGroup);

    const { result } = renderHook(
      () => usePageGroupsList('site-1', 'it', 'collection-news'),
      { wrapper },
    );

    await act(async () => {
      await result.current.createPageGroup({
        name: 'Nuovo articolo',
        templateId: 'template-1',
        parentId: null,
      });
    });

    expect(api.createPageGroup).toHaveBeenCalledWith({
      siteId: 'site-1',
      collectionId: 'collection-news',
      parentId: null,
      templateId: 'template-1',
      translation: {
        locale: 'it',
        slug: 'nuovo-articolo',
        seoMeta: { title: 'Nuovo articolo', description: '' },
      },
    });
  });

  it('deletePageGroup removes the group', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.deletePageGroup).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePageGroupsList('site-1', 'it'), {
      wrapper,
    });

    await act(async () => {
      await result.current.deletePageGroup(sampleGroup.id);
    });

    expect(api.deletePageGroup).toHaveBeenCalledWith(sampleGroup.id);
  });

  // It stays in the list: the list offers the way to the copy, it does not
  // take it (page-groups-list-view.tsx).
  it('duplicatePageGroup duplicates the group and stays where it is, handing back the copy', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    const duplicate = { ...sampleGroup, id: 'group-2' };
    vi.mocked(api.duplicatePageGroup).mockResolvedValue(duplicate);

    const { result } = renderHook(() => usePageGroupsList('site-1', 'it'), {
      wrapper,
    });

    let copy: unknown;
    await act(async () => {
      copy = await result.current.duplicatePageGroup(sampleGroup.id);
    });

    expect(api.duplicatePageGroup).toHaveBeenCalledWith(sampleGroup.id);
    expect(copy).toEqual(duplicate);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reorderPageGroups threads parentId and the ordered ids through', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.reorderPageGroups).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePageGroupsList('site-1', 'it'), {
      wrapper,
    });

    await act(async () => {
      await result.current.reorderPageGroups(null, ['b', 'a']);
    });

    expect(api.reorderPageGroups).toHaveBeenCalledWith('site-1', null, [
      'b',
      'a',
    ]);
  });
});
