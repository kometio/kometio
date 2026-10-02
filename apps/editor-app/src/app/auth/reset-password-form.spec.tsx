import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../lib/auth-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ResetPasswordForm } from './reset-password-form';

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return { ...actual, resetPassword: vi.fn() };
});

function renderForm(token: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ResetPasswordForm token={token} />
    </QueryClientProvider>,
  );
}

function fillAndSubmit(password: string) {
  fireEvent.change(screen.getByLabelText('Nuova password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /reimposta password/i }));
}

describe('ResetPasswordForm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('submits the token and new password, then shows a confirmation', async () => {
    vi.mocked(api.resetPassword).mockResolvedValue(undefined);
    renderForm('a-token');

    fillAndSubmit('new-password-123');

    await waitFor(() =>
      expect(screen.getByText(/password aggiornata/i)).toBeTruthy(),
    );
    expect(api.resetPassword).toHaveBeenCalledWith(
      'a-token',
      'new-password-123',
    );
  });

  it('shows an error message when the token is invalid or expired', async () => {
    vi.mocked(api.resetPassword).mockRejectedValue(new Error('bad token'));
    renderForm('bad-token');

    fillAndSubmit('new-password-123');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('non è valido o è scaduto');
  });
});
