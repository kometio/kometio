import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { AccountProfile } from '@kometio/api-contracts';
import i18n from '../../i18n';
import * as accountApi from '../../lib/account-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { accountProfileQueryOptions } from './account-queries';
import { useApplySavedInterfaceLanguage } from './use-interface-language';

vi.mock('../../lib/account-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/account-api-client')>()),
  getAccountProfile: vi.fn(),
}));

function profileIn(language: AccountProfile['language']): AccountProfile {
  return {
    id: 'user-1',
    email: 'chi@esempio.it',
    role: 'editor',
    displayName: null,
    slug: null,
    bio: {},
    avatarUrl: null,
    language,
  };
}

function Opening() {
  useApplySavedInterfaceLanguage();
  return <p>open</p>;
}

function renderOpening(queryClient: QueryClient = createTestQueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <Opening />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('opening the editor in the saved language', () => {
  afterEach(async () => {
    vi.mocked(accountApi.getAccountProfile).mockReset();
    // The tests run in Italian; a language change must not leak.
    await i18n.changeLanguage('it');
  });

  it('puts the editor in the language the person saved', async () => {
    vi.mocked(accountApi.getAccountProfile).mockResolvedValue(profileIn('en'));

    renderOpening();

    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(screen.getByText('open')).toBeTruthy();
  });

  it('leaves the editor as it is for someone who has not chosen yet', async () => {
    vi.mocked(accountApi.getAccountProfile).mockResolvedValue(profileIn(null));

    const queryClient = renderOpening();
    await waitFor(() =>
      expect(
        queryClient.getQueryData(accountProfileQueryOptions().queryKey),
      ).toBeTruthy(),
    );

    expect(i18n.language).toBe('it');
  });

  it('does not undo a choice made since, when the profile arrives again', async () => {
    vi.mocked(accountApi.getAccountProfile).mockResolvedValue(profileIn('en'));
    const queryClient = renderOpening();
    await waitFor(() => expect(i18n.language).toBe('en'));

    // The person picks Italian; the profile the server still holds says English.
    await act(async () => {
      await i18n.changeLanguage('it');
      queryClient.setQueryData(
        accountProfileQueryOptions().queryKey,
        profileIn('en'),
      );
    });

    expect(i18n.language).toBe('it');
  });
});
