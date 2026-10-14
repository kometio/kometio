import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/second-factor-api-client';
import { ApiError } from '../../lib/http-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { SecondFactorSection } from './second-factor-section';

vi.mock('../../lib/second-factor-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/second-factor-api-client')>();
  return {
    ...actual,
    getSecondFactorStatus: vi.fn(),
    beginSecondFactor: vi.fn(),
    confirmSecondFactor: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
    disableSecondFactor: vi.fn(),
  };
});

// The suite runs pinned to Italian (test-setup.ts).
function renderSection() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <SecondFactorSection />
      </WithToasts>
    </QueryClientProvider>,
  );
}

const OFF = { available: true, enabled: false, recoveryCodesLeft: 0 };
const ON = { available: true, enabled: true, recoveryCodesLeft: 7 };

describe('SecondFactorSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('draws nothing where the server cannot seal a secret', async () => {
    vi.mocked(api.getSecondFactorStatus).mockResolvedValue({
      available: false,
      enabled: false,
      recoveryCodesLeft: 0,
    });

    renderSection();

    await waitFor(() => expect(api.getSecondFactorStatus).toHaveBeenCalled());
    expect(
      screen.queryByRole('heading', { name: /verifica in due passaggi/i }),
    ).toBeNull();
  });

  it('says it is off, and offers to turn it on', async () => {
    vi.mocked(api.getSecondFactorStatus).mockResolvedValue(OFF);

    renderSection();

    expect(
      await screen.findByRole('button', { name: /^attiva…$/i }),
    ).toBeTruthy();
    expect(screen.getByText('Non attiva')).toBeTruthy();
  });

  it('says it is on, how many recovery codes are left, and offers the two things that can be done', async () => {
    vi.mocked(api.getSecondFactorStatus).mockResolvedValue(ON);

    renderSection();

    expect(await screen.findByText('Attiva')).toBeTruthy();
    expect(screen.getByText(/ancora 7 codici di recupero/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /nuovi codici di recupero…/i }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^disattiva…$/i })).toBeTruthy();
  });

  describe('turning it on', () => {
    async function openDialog() {
      vi.mocked(api.getSecondFactorStatus).mockResolvedValue(OFF);
      renderSection();
      fireEvent.click(
        await screen.findByRole('button', { name: /^attiva…$/i }),
      );
      return screen.findByRole('dialog', {
        name: /attiva la verifica in due passaggi/i,
      });
    }

    it('goes password, then the secret and a code, then the recovery codes — and only the codes step lets it be finished', async () => {
      vi.mocked(api.beginSecondFactor).mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        provisioningUri:
          'otpauth://totp/Studio:anna@example.test?secret=JBSWY3DPEHPK3PXP',
      });
      vi.mocked(api.confirmSecondFactor).mockResolvedValue({
        recoveryCodes: ['abcde-fghjk', 'mnpqr-stuvw'],
      });
      const dialog = await openDialog();

      fireEvent.change(within(dialog).getByLabelText(/password attuale/i), {
        target: { value: 'my-password' },
      });
      fireEvent.click(
        within(dialog).getByRole('button', { name: /continua/i }),
      );

      await within(dialog).findByText('JBSWY3DPEHPK3PXP');
      expect(api.beginSecondFactor).toHaveBeenCalledWith('my-password');
      expect(within(dialog).getByRole('img')).toBeTruthy();
      fireEvent.change(within(dialog).getByLabelText(/codice dell’app/i), {
        target: { value: '123456' },
      });
      fireEvent.click(
        within(dialog).getByRole('button', { name: /^attiva$/i }),
      );

      await within(dialog).findByText('abcde-fghjk');
      expect(api.confirmSecondFactor).toHaveBeenCalledWith('123456');
      const done = within(dialog).getByRole('button', { name: /fatto/i });
      expect((done as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(
        within(dialog).getByRole('checkbox', { name: /li ho conservati/i }),
      );
      expect((done as HTMLButtonElement).disabled).toBe(false);
    });

    it('says a wrong password under the field, and does not move on', async () => {
      vi.mocked(api.beginSecondFactor).mockRejectedValue(
        new ApiError(403, { message: 'The current password is not correct' }),
      );
      const dialog = await openDialog();

      fireEvent.change(within(dialog).getByLabelText(/password attuale/i), {
        target: { value: 'wrong' },
      });
      fireEvent.click(
        within(dialog).getByRole('button', { name: /continua/i }),
      );

      expect(
        await within(dialog).findByText(/non è la tua password attuale/i),
      ).toBeTruthy();
      expect(within(dialog).queryByRole('img')).toBeNull();
    });

    it('says a code that does not match, and stays where it is', async () => {
      vi.mocked(api.beginSecondFactor).mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        provisioningUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
      });
      vi.mocked(api.confirmSecondFactor).mockRejectedValue(
        new ApiError(400, { message: 'The code does not match' }),
      );
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText(/password attuale/i), {
        target: { value: 'my-password' },
      });
      fireEvent.click(
        within(dialog).getByRole('button', { name: /continua/i }),
      );
      await within(dialog).findByText('JBSWY3DPEHPK3PXP');

      fireEvent.change(within(dialog).getByLabelText(/codice dell’app/i), {
        target: { value: '000000' },
      });
      fireEvent.click(
        within(dialog).getByRole('button', { name: /^attiva$/i }),
      );

      expect(
        await within(dialog).findByText(/il codice non corrisponde/i),
      ).toBeTruthy();
      expect(within(dialog).getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    });
  });

  it('turns it off with the password, and says so', async () => {
    vi.mocked(api.getSecondFactorStatus).mockResolvedValue(ON);
    vi.mocked(api.disableSecondFactor).mockResolvedValue(undefined);
    renderSection();
    fireEvent.click(
      await screen.findByRole('button', { name: /^disattiva…$/i }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: /disattiva la verifica in due passaggi/i,
    });

    fireEvent.change(within(dialog).getByLabelText(/password attuale/i), {
      target: { value: 'my-password' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: /^disattiva$/i }),
    );

    await waitFor(() =>
      expect(api.disableSecondFactor).toHaveBeenCalledWith('my-password'),
    );
    expect(
      await screen.findByText(/la verifica in due passaggi è disattivata/i),
    ).toBeTruthy();
  });

  it('shows new recovery codes once the password is given, and keeps them until they are kept', async () => {
    vi.mocked(api.getSecondFactorStatus).mockResolvedValue(ON);
    vi.mocked(api.regenerateRecoveryCodes).mockResolvedValue({
      recoveryCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'],
    });
    renderSection();
    fireEvent.click(
      await screen.findByRole('button', { name: /nuovi codici di recupero…/i }),
    );
    const ask = await screen.findByRole('dialog', {
      name: /nuovi codici di recupero/i,
    });

    fireEvent.change(within(ask).getByLabelText(/password attuale/i), {
      target: { value: 'my-password' },
    });
    fireEvent.click(
      within(ask).getByRole('button', { name: /crea nuovi codici/i }),
    );

    expect(await screen.findByText('aaaaa-bbbbb')).toBeTruthy();
    expect(api.regenerateRecoveryCodes).toHaveBeenCalledWith('my-password');
  });
});
