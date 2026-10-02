import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { usePageList } from './page-list-context';
import type { PickedPage } from '@kometio/shared-types';
import {
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
} from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { PageListProvider } from './page-list-provider';

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return { ...actual, listPageGroups: vi.fn() };
});

// One group with both an it and an en translation — exercises the picker's
// own per-locale translation lookup (group.translations.find), not just
// display of whatever the mock hands it.
const bilingualGroup = buildPageGroupListItemRecord({
  translations: [
    buildPageGroupListItemTranslation({
      locale: 'it',
      slug: 'chi-siamo',
      title: 'Chi siamo',
    }),
    buildPageGroupListItemTranslation({
      locale: 'en',
      slug: 'about-us',
      title: 'About us',
    }),
  ],
});

function PickerConsumer() {
  const { pick } = usePageList();
  const [result, setResult] = useState<PickedPage | null | 'pending'>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setResult('pending');
          void pick().then(setResult);
        }}
      >
        Apri picker
      </button>
      <p>{result === 'pending' || result === null ? '' : result.title}</p>
    </div>
  );
}

function renderProvider(locale = 'it') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <PageListProvider siteId="site-1" locale={locale}>
        <PickerConsumer />
      </PageListProvider>
    </QueryClientProvider>,
  );
}

describe('PageListProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens the dialog on pick(), offering only the given locale's translation of each page", async () => {
    vi.mocked(api.listPageGroups).mockResolvedValue({
      items: [bilingualGroup],
      total: 1,
    });

    renderProvider('it');
    fireEvent.click(screen.getByRole('button', { name: 'Apri picker' }));

    await screen.findByRole('button', { name: /chi siamo/i });
    expect(screen.queryByRole('button', { name: /about us/i })).toBeNull();
  });

  it('resolves with the picked page and closes the dialog', async () => {
    vi.mocked(api.listPageGroups).mockResolvedValue({
      items: [bilingualGroup],
      total: 1,
    });

    renderProvider('it');
    fireEvent.click(screen.getByRole('button', { name: 'Apri picker' }));
    fireEvent.click(await screen.findByRole('button', { name: /chi siamo/i }));

    await waitFor(() => expect(screen.getByText('Chi siamo')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: /scegli/i })).toBeNull();
  });

  it('resolves with null when the dialog is dismissed without a selection', async () => {
    vi.mocked(api.listPageGroups).mockResolvedValue({ items: [], total: 0 });

    renderProvider('it');
    fireEvent.click(screen.getByRole('button', { name: 'Apri picker' }));
    await screen.findByRole('heading', { name: /scegli/i });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /scegli/i })).toBeNull(),
    );
  });
});
