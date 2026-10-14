import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { AcceptInviteForm } from './accept-invite-form';
import { ForgotPasswordForm } from './forgot-password-form';
import { LoginForm } from './login-form';
import { ResetPasswordForm } from './reset-password-form';
import { SetupWizardForm } from './setup-wizard-form';

vi.mock('../../lib/deployment-api-client', async () => {
  const { deploymentRecord } =
    await import('../../test/deployment.test-fixture');
  return { getDeployment: vi.fn().mockResolvedValue(deploymentRecord()) };
});

/*
 * An email or a password field with no `autocomplete` is left to the
 * browser's guess: on the setup screen it guessed "current-password", so a
 * password manager was offered to fill an existing password where it should
 * have offered to make a new one — on the one account nobody can unlock for
 * you (WCAG 1.3.5, Identify Input Purpose).
 */
function withProviders(children: React.ReactNode) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('the sign-in screens say what their fields are for', () => {
  it('signing in: the address is the username, the password is the current one', () => {
    render(<LoginForm onLogin={vi.fn()} onForgotPassword={vi.fn()} />);

    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe(
      'username',
    );
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe(
      'current-password',
    );
  });

  it('setting up: the password is a new one, so a manager offers to make it', () => {
    render(<SetupWizardForm onSubmit={vi.fn()} />);

    expect(
      screen.getByLabelText(/la tua email/i).getAttribute('autocomplete'),
    ).toBe('username');
    expect(
      screen.getByLabelText(/^password/i).getAttribute('autocomplete'),
    ).toBe('new-password');
  });

  it('accepting an invitation and resetting a password: a new password', () => {
    const { unmount } = render(
      withProviders(<AcceptInviteForm token="invite-abc" />),
    );
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe(
      'new-password',
    );
    unmount();

    render(withProviders(<ResetPasswordForm token="a-token" />));
    expect(
      screen.getByLabelText('Nuova password').getAttribute('autocomplete'),
    ).toBe('new-password');
  });

  it('asking for a reset: the address is an email', () => {
    render(withProviders(<ForgotPasswordForm onBackToLogin={vi.fn()} />));

    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe(
      'email',
    );
  });
});
