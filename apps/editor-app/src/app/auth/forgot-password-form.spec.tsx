import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../lib/auth-api-client';
import * as deployment from '../../lib/deployment-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ForgotPasswordForm } from './forgot-password-form';

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return { ...actual, requestPasswordReset: vi.fn() };
});

vi.mock('../../lib/deployment-api-client', () => ({
  getDeployment: vi.fn().mockResolvedValue({ emailConfigured: true }),
}));

function renderForm(onBackToLogin = vi.fn()) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ForgotPasswordForm onBackToLogin={onBackToLogin} />
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.mocked(deployment.getDeployment).mockResolvedValue({
      emailConfigured: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * Before a session there is nobody to tell an administrator about the
   * server; the person who forgot their password is told that no email will
   * come, the same for every address (docs/adr/0103).
   */
  describe('on a server with no mail server', () => {
    beforeEach(() => {
      vi.mocked(deployment.getDeployment).mockResolvedValue({
        emailConfigured: false,
      });
    });

    it('says before the request that no email will come, and where the link is', async () => {
      renderForm();

      expect(await screen.findByText(/non può inviare email/i)).toBeTruthy();
      expect(screen.getByText(/log del server/i)).toBeTruthy();
    });

    it('does not say an email was sent once the request is made', async () => {
      vi.mocked(api.requestPasswordReset).mockResolvedValue(undefined);
      renderForm();
      await screen.findByText(/non può inviare email/i);

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'lele@example.com' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: /invia link di reset/i }),
      );

      expect(
        await screen.findByText(/non può inviare email: lo trovi nel log/i),
      ).toBeTruthy();
      expect(screen.queryByText(/ti abbiamo inviato/i)).toBeNull();
    });
  });

  it('says nothing about email on a server that can send it', async () => {
    renderForm();

    await waitFor(() => expect(deployment.getDeployment).toHaveBeenCalled());
    expect(screen.queryByText(/non può inviare email/i)).toBeNull();
  });

  it('shows the same confirmation whether or not the email matched an account', async () => {
    vi.mocked(api.requestPasswordReset).mockResolvedValue(undefined);
    renderForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'lele@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /invia link di reset/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/se l'indirizzo esiste/i)).toBeTruthy(),
    );
    expect(api.requestPasswordReset).toHaveBeenCalledWith(
      'lele@example.com',
      'fake-turnstile-token-for-tests',
    );
  });

  it('shows the confirmation even when the request itself fails', async () => {
    vi.mocked(api.requestPasswordReset).mockRejectedValue(
      new Error('network error'),
    );
    renderForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'lele@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /invia link di reset/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/se l'indirizzo esiste/i)).toBeTruthy(),
    );
  });

  it('calls onBackToLogin when the link is clicked', () => {
    const onBackToLogin = vi.fn();
    renderForm(onBackToLogin);

    fireEvent.click(screen.getByRole('button', { name: /torna al login/i }));

    expect(onBackToLogin).toHaveBeenCalled();
  });
});
