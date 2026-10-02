import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { ChangePasswordDialog } from './change-password-dialog';

const CURRENT = 'Password attuale';
const NEW = 'Nuova password';
const REPEAT = 'Ripeti la nuova password';

function renderDialog(onChangePassword = vi.fn().mockResolvedValue(undefined)) {
  const onOpenChange = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <TooltipProvider>
        <ToastProvider>
          <button type="button" onClick={() => setOpen(true)}>
            reopen
          </button>
          <ChangePasswordDialog
            open={open}
            onOpenChange={(next) => {
              onOpenChange(next);
              setOpen(next);
            }}
            onChangePassword={onChangePassword}
          />
        </ToastProvider>
      </TooltipProvider>
    );
  }
  render(<Harness />);
  return { onChangePassword, onOpenChange };
}

function fill(current: string, next: string, repeat = next) {
  fireEvent.change(screen.getByLabelText(CURRENT), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText(NEW), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(REPEAT), {
    target: { value: repeat },
  });
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));

describe('ChangePasswordDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends the current and the new password, closes and says what happened', async () => {
    const { onChangePassword, onOpenChange } = renderDialog();

    fill('old-password', 'a-new-password');
    submit();

    await waitFor(() =>
      expect(onChangePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'a-new-password',
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      await screen.findByText(
        'Password cambiata. Ogni altro accesso è stato chiuso.',
      ),
    ).toBeTruthy();
  });

  it('refuses a new password that is too short, under its field, without asking the server', () => {
    const { onChangePassword } = renderDialog();

    fill('old-password', 'short');
    submit();

    expect(
      screen.getByText('La nuova password deve avere almeno 8 caratteri.'),
    ).toBeTruthy();
    expect(screen.getByLabelText(NEW).getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(onChangePassword).not.toHaveBeenCalled();
  });

  it('refuses two new passwords that differ', () => {
    const { onChangePassword } = renderDialog();

    fill('old-password', 'a-new-password', 'a-new-passwrod');
    submit();

    expect(screen.getByText('Le due password non coincidono.')).toBeTruthy();
    expect(onChangePassword).not.toHaveBeenCalled();
  });

  it('asks for the current password instead of leaving the button dead', () => {
    const { onChangePassword } = renderDialog();

    fill('', 'a-new-password');
    submit();

    expect(screen.getByText('Scrivi la password attuale.')).toBeTruthy();
    expect(onChangePassword).not.toHaveBeenCalled();
  });

  it('says a wrong current password under that field, and keeps what was typed', async () => {
    const { onOpenChange } = renderDialog(
      vi.fn().mockRejectedValue(new ApiError(403, { message: 'nope' })),
    );

    fill('not-it', 'a-new-password');
    submit();

    expect(
      await screen.findByText('Questa non è la tua password attuale.'),
    ).toBeTruthy();
    expect((screen.getByLabelText(NEW) as HTMLInputElement).value).toBe(
      'a-new-password',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('says when there have been too many tries', async () => {
    renderDialog(vi.fn().mockRejectedValue(new ApiError(429, {})));

    fill('not-it', 'a-new-password');
    submit();

    expect(
      await screen.findByText(
        'Troppi tentativi sbagliati. Aspetta qualche minuto e riprova.',
      ),
    ).toBeTruthy();
  });

  it('opens empty every time: a password typed before is not there after Cancel', async () => {
    renderDialog();
    fill('old-password', 'a-new-password');

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByLabelText(CURRENT)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }));

    expect(
      ((await screen.findByLabelText(CURRENT)) as HTMLInputElement).value,
    ).toBe('');
    expect((screen.getByLabelText(NEW) as HTMLInputElement).value).toBe('');
  });
});
