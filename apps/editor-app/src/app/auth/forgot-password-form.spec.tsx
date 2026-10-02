import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../lib/auth-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ForgotPasswordForm } from './forgot-password-form';

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return { ...actual, requestPasswordReset: vi.fn() };
});

function renderForm(onBackToLogin = vi.fn()) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ForgotPasswordForm onBackToLogin={onBackToLogin} />
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordForm', () => {
  afterEach(() => {
    vi.clearAllMocks();
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
