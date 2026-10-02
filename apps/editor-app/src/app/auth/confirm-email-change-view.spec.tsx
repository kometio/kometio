import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../lib/auth-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ConfirmEmailChangeView } from './confirm-email-change-view';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return { ...actual, confirmEmailChange: vi.fn() };
});

function renderView(token: string) {
  return render(
    // Strict Mode, as main.tsx has it: the link works once, so the view has
    // to ask once even though the effect runs twice.
    <StrictMode>
      <QueryClientProvider client={createTestQueryClient()}>
        <ConfirmEmailChangeView token={token} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('ConfirmEmailChangeView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('confirms the link once and says the email was changed', async () => {
    vi.mocked(api.confirmEmailChange).mockResolvedValue(undefined);

    renderView('a-token');

    expect(screen.getByText('Conferma in corso...')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(
          'L’email è stata cambiata. Usala al prossimo accesso.',
        ),
      ).toBeTruthy(),
    );
    expect(api.confirmEmailChange).toHaveBeenCalledTimes(1);
    expect(api.confirmEmailChange).toHaveBeenCalledWith('a-token');
    expect(
      screen.getByRole('link', { name: 'Vai al tuo profilo' }),
    ).toBeTruthy();
  });

  it('says when the link is invalid, expired or the address was taken', async () => {
    vi.mocked(api.confirmEmailChange).mockRejectedValue(new Error('bad'));

    renderView('bad-token');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('non è valido o è scaduto');
  });
});
