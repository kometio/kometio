import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CURATED_LOCALE_CODES,
  getLocaleDisplayName,
} from '@kometio/shared-types';
import { ApiError } from '../../lib/http-client';
import { DEFAULT_SETUP_LOCALE, SetupWizardForm } from './setup-wizard-form';

// The suite runs pinned to Italian (test-setup.ts), so the queries below
// match the Italian copy — same convention as every other dialog spec here.
function fillAndSubmit(
  onSubmit: (input: never) => Promise<void>,
  proposedDomain?: string,
) {
  render(
    <SetupWizardForm
      onSubmit={onSubmit as never}
      proposedDomain={proposedDomain}
    />,
  );

  fireEvent.change(screen.getByLabelText(/token di installazione/i), {
    target: { value: 'the-real-token' },
  });
  fireEvent.change(screen.getByLabelText(/nome del sito/i), {
    target: { value: 'Pasticceria Rossi' },
  });
  fireEvent.change(screen.getByLabelText(/la tua email/i), {
    target: { value: 'anna@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/^password/i), {
    target: { value: 'a-long-enough-pass' },
  });
  fireEvent.click(screen.getByRole('button', { name: /crea il mio account/i }));
}

describe('SetupWizardForm', () => {
  it('sends the setup token along with the account details', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    fillAndSubmit(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        setupToken: 'the-real-token',
        siteName: 'Pasticceria Rossi',
        adminEmail: 'anna@example.test',
      }),
    );
  });

  /*
   * The site is found by the domain it was given, so one created without it
   * answers "not found" at every address until someone sets it by hand. The
   * wizard starts the field on the domain of the address the deployment was
   * told to serve, so that leaving it alone is the right answer.
   */
  describe("the site's domain", () => {
    const domainField = () =>
      screen.getByLabelText(/^dominio/i) as HTMLInputElement;

    it('starts on the domain it was proposed', () => {
      render(<SetupWizardForm onSubmit={vi.fn()} proposedDomain="localhost" />);

      expect(domainField().value).toBe('localhost');
    });

    it('starts empty when there is nothing right to propose', () => {
      render(<SetupWizardForm onSubmit={vi.fn()} />);

      expect(domainField().value).toBe('');
    });

    it('sends the proposed domain when the user never touches the field', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      fillAndSubmit(onSubmit, 'localhost');

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'localhost' }),
      );
    });

    it('takes the scheme and the path out of what is typed, and says so', async () => {
      render(<SetupWizardForm onSubmit={vi.fn()} proposedDomain="localhost" />);

      fireEvent.change(domainField(), {
        target: { value: 'https://Pasticceria.Test/chi-siamo' },
      });

      expect(domainField().value).toBe('pasticceria.test');
      const note = await screen.findByRole('status');
      expect(note.textContent).toContain('https://');
      expect(note.textContent).toContain('/chi-siamo');
    });

    it('sends nothing as the domain when the user empties the field, to set it later', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <SetupWizardForm onSubmit={onSubmit} proposedDomain="localhost" />,
      );

      fireEvent.change(domainField(), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText(/token di installazione/i), {
        target: { value: 'the-real-token' },
      });
      fireEvent.change(screen.getByLabelText(/nome del sito/i), {
        target: { value: 'Pasticceria Rossi' },
      });
      fireEvent.change(screen.getByLabelText(/la tua email/i), {
        target: { value: 'anna@example.test' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'a-long-enough-pass' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: /crea il mio account/i }),
      );

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ domain: null }),
      );
    });

    it('does not send a domain that is not a hostname, and says what is wrong under the field', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      fillAndSubmit(onSubmit, 'not a domain');

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/non sembra un dominio/i);
      expect(domainField().getAttribute('aria-invalid')).toBe('true');
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  // The token is the one field whose rejection a person can act on, and
  // the action — re-read the API's log — is not guessable from a generic
  // "something went wrong".
  it('tells the user where to find a valid token when the server rejects it', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new ApiError(401, 'Invalid setup token'));

    fillAndSubmit(onSubmit);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/log/i);
    expect(alert.textContent).toMatch(/riavvio/i);
  });

  it('falls back to the generic message for anything that is not a rejected token', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(500, 'boom'));

    fillAndSubmit(onSubmit);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/ricarica la pagina/i);
  });

  // A <select> whose `value` matches no <option> silently renders the FIRST
  // one. That happened: the default was a bare 'en', the curated list holds
  // only full tags, so the field showed "Arabic (Saudi Arabia)" while the
  // submitted value stayed 'en' — worst for whoever actually wanted Arabic,
  // saw it preselected, and got an English site.
  it('starts on a locale that really exists in the curated list', () => {
    expect(CURATED_LOCALE_CODES).toContain(DEFAULT_SETUP_LOCALE);
  });

  it('shows that same locale as the selected option', () => {
    render(<SetupWizardForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/lingua predefinita/i).textContent).toBe(
      getLocaleDisplayName(DEFAULT_SETUP_LOCALE),
    );
  });

  it('submits the preselected locale when the user never touches the field', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    fillAndSubmit(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ defaultLocale: DEFAULT_SETUP_LOCALE }),
    );
  });

  it('marks the token field required, so the browser blocks an empty submit', () => {
    render(<SetupWizardForm onSubmit={vi.fn()} />);

    // Plain DOM, not jest-dom: this suite has no jest-dom matchers set up.
    expect(screen.getByLabelText(/token di installazione/i)).toHaveProperty(
      'required',
      true,
    );
  });

  describe('opening a site from another installation (docs/adr/0106)', () => {
    it('offers it only when the screen is told it can be done', () => {
      const { rerender } = render(
        <SetupWizardForm onSubmit={vi.fn().mockResolvedValue(undefined)} />,
      );
      expect(
        screen.queryByRole('button', {
          name: /ho già un sito di un’altra installazione/i,
        }),
      ).toBeNull();

      rerender(
        <SetupWizardForm
          onSubmit={vi.fn().mockResolvedValue(undefined)}
          onChooseImport={vi.fn()}
        />,
      );

      expect(
        screen.getByRole('button', {
          name: /ho già un sito di un’altra installazione/i,
        }),
      ).toBeTruthy();
    });

    it('goes there when it is chosen, without sending the form', () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onChooseImport = vi.fn();
      render(
        <SetupWizardForm onSubmit={onSubmit} onChooseImport={onChooseImport} />,
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: /ho già un sito di un’altra installazione/i,
        }),
      );

      expect(onChooseImport).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
