import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  buildPageGroupRecord,
  buildPageGroupVersionRecord,
} from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { pageGroupQueryOptions } from './page-groups-queries';
import { usePageGroupVersions } from './use-page-group-versions';

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    listPageGroupVersions: vi.fn(),
    rollbackPageGroupToVersion: vi.fn(),
  };
});

const sampleGroup = buildPageGroupRecord();

const versionA = buildPageGroupVersionRecord({
  id: 'v1',
  content: [{ type: 'Text', props: { body: 'v1' } }],
});

function renderWithClient() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    pageGroupQueryOptions('group-1').queryKey,
    sampleGroup,
  );
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { wrapper, queryClient };
}

describe('usePageGroupVersions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch versions until enabled', () => {
    const { wrapper } = renderWithClient();

    renderHook(() => usePageGroupVersions('group-1', false), { wrapper });

    expect(api.listPageGroupVersions).not.toHaveBeenCalled();
  });

  it('fetches versions once enabled', async () => {
    vi.mocked(api.listPageGroupVersions).mockResolvedValue([versionA]);
    const { wrapper } = renderWithClient();

    const { result } = renderHook(() => usePageGroupVersions('group-1', true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.versions).toEqual([versionA]));
  });

  it('rollback updates the cached group and invalidates the versions list', async () => {
    const restored = { ...sampleGroup, content: versionA.content };
    vi.mocked(api.rollbackPageGroupToVersion).mockResolvedValue(restored);
    const { wrapper, queryClient } = renderWithClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePageGroupVersions('group-1', true), {
      wrapper,
    });

    await act(async () => {
      await result.current.rollback('v1');
    });

    expect(api.rollbackPageGroupToVersion).toHaveBeenCalledWith(
      'group-1',
      'v1',
    );
    expect(
      queryClient.getQueryData(pageGroupQueryOptions('group-1').queryKey),
    ).toEqual(restored);
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
