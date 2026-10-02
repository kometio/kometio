import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../lib/auth-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { AcceptInviteForm } from './accept-invite-form';

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return { ...actual, acceptInvite: vi.fn() };
});

function renderForm(token = 'invite-abc') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AcceptInviteForm token={token} />
    </QueryClientProvider>,
  );
}

describe('AcceptInviteForm', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, description, and password field', () => {
    renderForm();

    expect(
      screen.getByRole('heading', { name: 'Completa la registrazione' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Scegli una password per accedere al tuo account Kometio',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('submits the token and password, then shows the done message', async () => {
    vi.mocked(api.acceptInvite).mockResolvedValue(undefined);

    renderForm('invite-xyz');
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-new-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Completa la registrazione' }),
    );

    await waitFor(() =>
      expect(api.acceptInvite).toHaveBeenCalledWith(
        'invite-xyz',
        'a-new-password',
      ),
    );
    expect(
      await screen.findByText('Password impostata. Puoi accedere ora.'),
    ).toBeTruthy();
  });

  it('shows an error message when the invite link is invalid or expired', async () => {
    vi.mocked(api.acceptInvite).mockRejectedValue(new Error('expired'));

    renderForm();
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-new-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Completa la registrazione' }),
    );

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('disables the submit button while the mutation is pending', async () => {
    vi.mocked(api.acceptInvite).mockReturnValue(new Promise(() => undefined));

    renderForm();
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-new-password' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Completa la registrazione' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Salvataggio...' }),
    ).toHaveProperty('disabled', true);
  });
});
