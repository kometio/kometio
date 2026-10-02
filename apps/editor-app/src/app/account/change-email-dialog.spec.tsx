import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import { ChangeEmailDialog } from './change-email-dialog';

const NEW_EMAIL = 'Nuova email';
const PASSWORD = 'Password attuale';

function renderDialog(
  onRequestEmailChange = vi.fn().mockResolvedValue(undefined),
) {
  const onOpenChange = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <ChangeEmailDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        currentEmail="giulia@example.com"
        onRequestEmailChange={onRequestEmailChange}
      />
    );
  }
  render(<Harness />);
  return { onRequestEmailChange, onOpenChange };
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(NEW_EMAIL), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(PASSWORD), {
    target: { value: password },
  });
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Invia il link' }));

describe('ChangeEmailDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks for the change, then says where the link went and that nothing has changed yet', async () => {
    const { onRequestEmailChange } = renderDialog();

    fill('  nuova@example.com ', 'my-password');
    submit();

    await waitFor(() =>
      expect(onRequestEmailChange).toHaveBeenCalledWith({
        newEmail: 'nuova@example.com',
        currentPassword: 'my-password',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Controlla la posta' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Abbiamo mandato un link a nuova@example.com. Finché non lo apri continui ad accedere con giulia@example.com.',
      ),
    ).toBeTruthy();
    // The password is not kept once it has been used.
    expect(screen.queryByLabelText(PASSWORD)).toBeNull();
  });

  it('refuses what is not an address, and the address they already have, before asking the server', () => {
    const { onRequestEmailChange } = renderDialog();

    fill('not an address', 'my-password');
    submit();
    expect(
      screen.getByText('Inserisci un indirizzo email valido.'),
    ).toBeTruthy();

    fill('giulia@example.com', 'my-password');
    submit();
    expect(screen.getByText('Questa è già la tua email.')).toBeTruthy();
    expect(onRequestEmailChange).not.toHaveBeenCalled();
  });

  it('asks for the current password instead of leaving the button dead', () => {
    const { onRequestEmailChange } = renderDialog();

    fill('nuova@example.com', '');
    submit();

    expect(screen.getByText('Scrivi la password attuale.')).toBeTruthy();
    expect(onRequestEmailChange).not.toHaveBeenCalled();
  });

  it('says a wrong password under the password, and a taken address under the address', async () => {
    const { onRequestEmailChange } = renderDialog(
      vi
        .fn()
        .mockRejectedValueOnce(new ApiError(403, {}))
        .mockRejectedValueOnce(new ApiError(409, {})),
    );

    fill('nuova@example.com', 'wrong');
    submit();
    expect(
      await screen.findByText('Questa non è la tua password attuale.'),
    ).toBeTruthy();

    submit();
    expect(
      await screen.findByText(
        'Questo indirizzo è già usato da un’altra persona.',
      ),
    ).toBeTruthy();
    expect(onRequestEmailChange).toHaveBeenCalledTimes(2);
    // Still the form, with what was typed.
    expect((screen.getByLabelText(NEW_EMAIL) as HTMLInputElement).value).toBe(
      'nuova@example.com',
    );
  });

  it('closes from the confirmation', async () => {
    const { onOpenChange } = renderDialog();
    fill('nuova@example.com', 'my-password');
    submit();

    fireEvent.click(await screen.findByRole('button', { name: 'Chiudi' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
