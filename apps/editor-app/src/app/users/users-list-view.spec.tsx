import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { chooseOption } from '../../test/select.test-fixture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import { WithToasts } from '../../test/toasts.test-fixture';
import * as auth from '../../lib/auth-api-client';
import * as deployment from '../../lib/deployment-api-client';
import * as api from '../../lib/users-api-client';
import type { UserRecord } from '../../lib/users-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildUserRecord } from '@kometio/testing/records';
import { UsersListView } from './users-list-view';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../../lib/auth-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/auth-api-client')>();
  return { ...actual, currentSession: vi.fn() };
});

vi.mock('../../lib/deployment-api-client', () => ({
  getDeployment: vi.fn().mockResolvedValue({ emailConfigured: true }),
}));

vi.mock('../../lib/users-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/users-api-client')>();
  return {
    ...actual,
    inviteUser: vi.fn(),
    updateUserRole: vi.fn(),
    setUserActive: vi.fn(),
    resendInvite: vi.fn(),
    cancelInvite: vi.fn(),
  };
});

const userOne = buildUserRecord({
  email: 'editor@example.com',
  displayName: 'Editor One',
  role: 'editor',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
});

function renderView(
  items: UserRecord[],
  options: { page?: number; total?: number } = {},
) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <UsersListView
          items={items}
          page={options.page ?? 1}
          total={options.total ?? items.length}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('UsersListView', () => {
  beforeEach(() => {
    vi.mocked(deployment.getDeployment).mockResolvedValue({
      emailConfigured: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // An invitation on a server with no mail server is written to its log: the
  // person who invites has to know, or "invited" reads as "will arrive".
  it('tells the administrator that invitations will not be mailed when the server has no mail server', async () => {
    vi.mocked(deployment.getDeployment).mockResolvedValue({
      emailConfigured: false,
    });

    renderView([userOne]);

    // By its words, not its role: the toasts' region is a `status` as well.
    expect(await screen.findByText(/non può inviare email/i)).toBeTruthy();
  });

  it('says nothing about email when the server can send it', async () => {
    renderView([userOne]);

    await waitFor(() => expect(deployment.getDeployment).toHaveBeenCalled());
    expect(screen.queryByText(/non può inviare email/i)).toBeNull();
  });

  it('shows an empty state when there are no users', () => {
    renderView([]);

    expect(screen.getByText(/nessun utente ancora/i)).toBeTruthy();
  });

  it('lists users with their name, email, and status', () => {
    renderView([userOne]);

    expect(screen.getByText('Editor One')).toBeTruthy();
    expect(screen.getByText('editor@example.com')).toBeTruthy();
    // A state has its own colour, and it is not the brand's.
    expect(screen.getByText('Attivo').getAttribute('data-variant')).toBe(
      'success',
    );
  });

  it('draws a person who cannot get in as a plain outline', () => {
    renderView([{ ...userOne, isActive: false }]);

    expect(screen.getByText('Disattivato').getAttribute('data-variant')).toBe(
      'outline',
    );
  });

  it('says what each role can do, under the list', () => {
    renderView([userOne]);

    const roles = screen.getByRole('region', {
      name: 'Cosa può fare ogni ruolo',
    });
    expect(within(roles).getByText('Admin')).toBeTruthy();
    expect(
      within(roles).getByText(/impostazioni del sito, tema/i),
    ).toBeTruthy();
    expect(within(roles).getByText(/un Publisher mette online/i)).toBeTruthy();
  });

  it('changes a user role', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.updateUserRole).mockResolvedValue({
      ...userOne,
      role: 'admin',
    });

    renderView([userOne]);
    chooseOption(
      screen.getByRole('combobox', { name: /ruolo di editor one/i }),
      'Admin',
    );

    await waitFor(() =>
      expect(api.updateUserRole).toHaveBeenCalledWith('user-1', 'admin'),
    );
    // Said, so nobody has to look at the select to know it took.
    expect(
      await screen.findByText('Ruolo di Editor One cambiato in Admin'),
    ).toBeTruthy();
  });

  it('asks before deactivating a user, and does nothing until the answer is yes', async () => {
    vi.mocked(api.setUserActive).mockResolvedValue({
      ...userOne,
      isActive: false,
    });

    renderView([userOne]);
    fireEvent.click(screen.getByRole('button', { name: /^disattiva$/i }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(api.setUserActive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Annulla'));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.setUserActive).not.toHaveBeenCalled();
  });

  it('deactivates an active user once the question is answered', async () => {
    vi.mocked(api.setUserActive).mockResolvedValue({
      ...userOne,
      isActive: false,
    });

    renderView([userOne]);
    fireEvent.click(screen.getByRole('button', { name: /^disattiva$/i }));
    fireEvent.click(
      screen.getAllByRole('button', { name: /^disattiva$/i }).at(-1) as Element,
    );

    await waitFor(() =>
      expect(api.setUserActive).toHaveBeenCalledWith('user-1', false),
    );
    expect(
      await screen.findByText('Editor One è stato disattivato'),
    ).toBeTruthy();
  });

  it('reactivating asks nothing — it gives access back, it does not take it away', async () => {
    vi.mocked(api.setUserActive).mockResolvedValue({ ...userOne });

    renderView([{ ...userOne, isActive: false }]);
    fireEvent.click(screen.getByRole('button', { name: /^riattiva$/i }));

    await waitFor(() =>
      expect(api.setUserActive).toHaveBeenCalledWith('user-1', true),
    );
    expect(
      await screen.findByText('Editor One è stato riattivato'),
    ).toBeTruthy();
  });

  /*
   * The row that costs the most looks like every other one. Refused
   * server-side as well — this is so the click is never worth making.
   */
  it('will not let you switch off, or demote, your own account', async () => {
    vi.mocked(auth.currentSession).mockResolvedValue({
      userId: 'user-1',
      email: 'editor@example.com',
      role: 'admin',
    });

    renderView([userOne]);

    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /^disattiva$/i })
          .hasAttribute('disabled'),
      ).toBe(true),
    );
    expect(
      screen.getByRole('combobox', { name: /ruolo/i }).hasAttribute('disabled'),
    ).toBe(true);
    // Who this row is, and why it is frozen — written on it, not in a
    // tooltip a phone never shows.
    expect(screen.getByText('Tu')).toBeTruthy();
    expect(
      screen.getByText(/non puoi cambiare il tuo ruolo né disattivarti/i),
    ).toBeTruthy();
  });

  it('says nothing about "you" on somebody else’s row', async () => {
    vi.mocked(auth.currentSession).mockResolvedValue({
      userId: 'someone-else',
      email: 'other@example.com',
      role: 'admin',
    });

    renderView([userOne]);

    await waitFor(() => expect(auth.currentSession).toHaveBeenCalled());
    expect(screen.queryByText('Tu')).toBeNull();
    expect(screen.queryByText(/non puoi cambiare il tuo ruolo/i)).toBeNull();
  });

  describe('an invitation that has not been accepted', () => {
    const invitee = {
      ...userOne,
      id: 'user-9',
      email: 'nuova@example.com',
      displayName: 'Nuova Persona',
      isActive: false,
      invitePending: true,
    };

    it('reads as waiting, with the two things that can be done about it', () => {
      renderView([invitee]);

      expect(screen.getByText('In attesa').getAttribute('data-variant')).toBe(
        'warning',
      );
      expect(
        screen.getByRole('button', { name: 'Reinvia invito' }),
      ).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Annulla invito' }),
      ).toBeTruthy();
      // There is nobody to reactivate yet.
      expect(screen.queryByRole('button', { name: /riattiva/i })).toBeNull();
      expect(screen.queryByText('Disattivato')).toBeNull();
    });

    it('sends the link again, and says to whom', async () => {
      vi.mocked(api.resendInvite).mockResolvedValue(undefined);
      renderView([invitee]);

      fireEvent.click(screen.getByRole('button', { name: 'Reinvia invito' }));

      await waitFor(() =>
        expect(api.resendInvite).toHaveBeenCalledWith('user-9'),
      );
      expect(
        await screen.findByText('Invito reinviato a nuova@example.com'),
      ).toBeTruthy();
    });

    it('does not say an email was sent when the server has no mail server', async () => {
      vi.mocked(deployment.getDeployment).mockResolvedValue({
        emailConfigured: false,
      });
      vi.mocked(api.resendInvite).mockResolvedValue(undefined);
      renderView([invitee]);
      await screen.findByText(/non può inviare email/i);

      fireEvent.click(screen.getByRole('button', { name: 'Reinvia invito' }));

      expect(
        await screen.findByText(
          'Il nuovo invito per nuova@example.com è pronto, ma nessuna email è partita: il suo link è nel log del server.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText(/reinviato a/)).toBeNull();
    });

    it('asks before withdrawing it, and does nothing until the answer is yes', async () => {
      vi.mocked(api.cancelInvite).mockResolvedValue(undefined);
      renderView([invitee]);

      fireEvent.click(screen.getByRole('button', { name: 'Annulla invito' }));
      const dialog = screen.getByRole('alertdialog');
      expect(within(dialog).getByText(/smetterà di funzionare/i)).toBeTruthy();
      expect(api.cancelInvite).not.toHaveBeenCalled();

      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Annulla invito' }),
      );

      await waitFor(() =>
        expect(api.cancelInvite).toHaveBeenCalledWith('user-9'),
      );
      expect(
        await screen.findByText('Invito a nuova@example.com annullato'),
      ).toBeTruthy();
    });

    it('says what went wrong when the link cannot be sent again', async () => {
      vi.mocked(api.resendInvite).mockRejectedValue(new Error('boom'));
      renderView([invitee]);

      fireEvent.click(screen.getByRole('button', { name: 'Reinvia invito' }));

      expect(
        await screen.findByText('Non è stato possibile applicare la modifica.'),
      ).toBeTruthy();
    });
  });

  describe('the language of each person', () => {
    it.each([
      ['it', 'Lingua: Italiano'],
      ['en', 'Lingua: English'],
    ] as const)('says %s in its own tongue', (language, text) => {
      renderView([{ ...userOne, language }]);

      expect(screen.getByText(text)).toBeTruthy();
    });

    it('says the site decides for somebody who has not chosen', () => {
      renderView([{ ...userOne, language: null }]);

      expect(screen.getByText('Lingua: quella del sito')).toBeTruthy();
    });
  });

  it('opens the invite dialog, which says what each role can do', () => {
    renderView([]);

    fireEvent.click(screen.getByRole('button', { name: /invita utente/i }));

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/scrive e modifica le bozze/i),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/impostazioni del sito, tema/i),
    ).toBeTruthy();
  });

  it('says the invitation was sent, and to whom', async () => {
    vi.mocked(api.inviteUser).mockResolvedValue({
      ...userOne,
      email: 'nuova@example.com',
    });
    renderView([]);

    fireEvent.click(screen.getByRole('button', { name: /invita utente/i }));
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'nuova@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Nuova Persona' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Invita' }));

    expect(
      await screen.findByText(
        'Invito inviato a nuova@example.com: riceverà un’email per scegliere la password.',
      ),
    ).toBeTruthy();
  });

  it('does not say an email was sent when the server has no mail server', async () => {
    vi.mocked(deployment.getDeployment).mockResolvedValue({
      emailConfigured: false,
    });
    vi.mocked(api.inviteUser).mockResolvedValue({
      ...userOne,
      email: 'nuova@example.com',
    });
    renderView([]);

    fireEvent.click(screen.getByRole('button', { name: /invita utente/i }));
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'nuova@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Nuova Persona' },
    });
    // The answer is in before the form is sent: the words depend on it.
    await screen.findAllByText(/non può inviare email/i);
    fireEvent.click(screen.getByRole('button', { name: 'Invita' }));

    expect(
      await screen.findByText(
        'nuova@example.com è stato invitato, ma nessuna email è partita: il link dell’invito è nel log del server.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/riceverà un’email/)).toBeNull();
  });

  describe('the language of the invitation', () => {
    async function fillInvitation() {
      fireEvent.click(screen.getByRole('button', { name: /invita utente/i }));
      fireEvent.change(await screen.findByLabelText('Email'), {
        target: { value: 'nuova@example.com' },
      });
      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'Nuova Persona' },
      });
    }

    it('is offered in the language the inviter reads the editor in, and sent with the invitation', async () => {
      vi.mocked(api.inviteUser).mockResolvedValue(userOne);
      renderView([]);

      await fillInvitation();
      fireEvent.click(screen.getByRole('button', { name: 'Invita' }));

      await waitFor(() =>
        expect(api.inviteUser).toHaveBeenCalledWith({
          email: 'nuova@example.com',
          displayName: 'Nuova Persona',
          role: 'editor',
          language: 'it',
        }),
      );
    });

    it('can be another one: the inviter chooses what the invitee is written to in', async () => {
      vi.mocked(api.inviteUser).mockResolvedValue(userOne);
      renderView([]);

      await fillInvitation();
      chooseOption(screen.getByLabelText('Lingua'), 'English');
      expect(
        screen.getByText(/ogni mail che riceverà dopo saranno scritti/i),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Invita' }));

      await waitFor(() =>
        expect(api.inviteUser).toHaveBeenCalledWith(
          expect.objectContaining({ language: 'en' }),
        ),
      );
    });
  });

  it('shows pagination controls when there is more than one page', () => {
    renderView([userOne], { total: 40 });

    expect(screen.getByText('Pagina 1 di 2')).toBeTruthy();
  });
});
