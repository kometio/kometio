import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';
import { instanceOf } from '../../test/dom.test-fixture';
import { captchaStaysUnsolved } from '../../test/fake-captcha';

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /^accedi$/i }));
}

describe('LoginForm', () => {
  // Security review 2026-08-24, point 13: submit must stay disabled until
  // the captcha actually hands back a token — this overrides the global
  // test-setup stand-in (which solves at once) to exercise the real
  // "widget hasn't responded yet" state every other test in this file
  // never sees.
  it('keeps the submit button disabled until the CAPTCHA widget provides a token', () => {
    captchaStaysUnsolved();
    const onLogin = vi.fn();
    render(<LoginForm onLogin={onLogin} onForgotPassword={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'lele@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^accedi$/i }));

    expect(onLogin).not.toHaveBeenCalled();
  });

  it('calls onLogin with the entered credentials', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onLogin={onLogin} onForgotPassword={vi.fn()} />);

    fillAndSubmit('lele@example.com', 'correct-horse-battery');

    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith(
        'lele@example.com',
        'correct-horse-battery',
        'fake-captcha-token-for-tests',
      ),
    );
  });

  it('shows an error message when onLogin rejects', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Unauthorized'));
    render(<LoginForm onLogin={onLogin} onForgotPassword={vi.fn()} />);

    fillAndSubmit('lele@example.com', 'wrong-password');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Email o password non corretti.');
  });

  it('does not call onLogin again until the previous attempt settles', async () => {
    let resolveLogin: () => void = () => undefined;
    const onLogin = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    );
    render(<LoginForm onLogin={onLogin} onForgotPassword={vi.fn()} />);

    fillAndSubmit('lele@example.com', 'correct-horse-battery');
    const submitButton = instanceOf(
      screen.getByRole('button', {
        name: /accesso in corso/i,
      }),
      HTMLButtonElement,
    );
    expect(submitButton.disabled).toBe(true);

    resolveLogin();
    await waitFor(() =>
      expect(
        instanceOf(
          screen.getByRole('button', { name: /^accedi$/i }),
          HTMLButtonElement,
        ).disabled,
      ).toBe(false),
    );
  });

  it('calls onForgotPassword when the link is clicked', () => {
    const onForgotPassword = vi.fn();
    render(<LoginForm onLogin={vi.fn()} onForgotPassword={onForgotPassword} />);

    fireEvent.click(
      screen.getByRole('button', { name: /password dimenticata/i }),
    );

    expect(onForgotPassword).toHaveBeenCalled();
  });
});
