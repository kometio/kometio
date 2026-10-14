import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPageGroupListItemRecord,
  buildPageGroupListItemTranslation,
  buildRedirectRecord,
} from '@kometio/testing/records';
import * as deployment from '../../lib/deployment-api-client';
import * as pagesApi from '../../lib/page-groups-api-client';
import * as redirectsApi from '../../lib/redirects-api-client';
import { ApiError } from '../../lib/http-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { deploymentRecord } from '../../test/deployment.test-fixture';
import { chooseOption } from '../../test/select.test-fixture';
import { RedirectDialog, type RedirectDialogProps } from './redirect-dialog';
import { instanceOf } from '../../test/dom.test-fixture';

vi.mock('../../lib/deployment-api-client', () => ({
  getDeployment: vi.fn(),
}));

vi.mock('../../lib/redirects-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/redirects-api-client')>();
  return { ...actual, testRedirect: vi.fn() };
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return { ...actual, listPageGroups: vi.fn() };
});

function renderDialog(props: Partial<RedirectDialogProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RedirectDialog
        siteId="site-1"
        defaultLocale="it"
        enabledLocales={['it']}
        redirect={null}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSubmit, onOpenChange };
}

const oldAddress = () => screen.getByLabelText('Indirizzo vecchio');
const choose = (name: RegExp | string) =>
  fireEvent.click(screen.getByRole('radio', { name }));
const submit = (name = 'Aggiungi reindirizzamento') =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('RedirectDialog', () => {
  beforeEach(() => {
    vi.mocked(deployment.getDeployment).mockResolvedValue(deploymentRecord());
    vi.mocked(pagesApi.listPageGroups).mockResolvedValue({
      items: [
        buildPageGroupListItemRecord({
          id: 'group-about',
          translations: [
            buildPageGroupListItemTranslation({
              locale: 'it',
              slug: 'chi-siamo',
              title: 'Chi siamo',
            }),
          ],
        }),
      ],
      total: 1,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('the old address', () => {
    it('shows a pasted link as the rule will keep it, while it is typed', () => {
      renderDialog();

      fireEvent.change(oldAddress(), {
        target: { value: 'https://Old-Site.com/2019/05/Hello/' },
      });

      expect(
        screen.getByText('Chi apre /2019/05/hello viene mandato avanti.'),
      ).toBeTruthy();
    });

    it('says what a pattern is, and which of its parts the destination may reuse', () => {
      renderDialog();

      fireEvent.change(oldAddress(), {
        target: { value: '/:year/:month/:slug' },
      });

      expect(screen.getByText(/Uno schema/)).toBeTruthy();
      expect(
        screen.getByText(
          'Parti che puoi riusare nella destinazione: :year, :month, :slug',
        ),
      ).toBeTruthy();
    });

    // "not an address" under "/a" while it is being typed is nagging.
    it('does not say a mistake before the field is left, and says it once it is', () => {
      renderDialog();

      fireEvent.change(oldAddress(), { target: { value: '/api/forms' } });
      expect(screen.queryByRole('alert')).toBeNull();

      fireEvent.blur(oldAddress());

      expect(screen.getByRole('alert').textContent).toContain('/api');
      expect(oldAddress().getAttribute('aria-invalid')).toBe('true');
    });

    it('starts with an address that was handed to it, as what was not found', () => {
      renderDialog({ initialFrom: '/2019/05/lost' });

      expect(instanceOf(oldAddress(), HTMLInputElement).value).toBe(
        '/2019/05/lost',
      );
    });
  });

  describe('where it goes', () => {
    it('sends an address, permanently unless it is said not to be', async () => {
      const { onSubmit, onOpenChange } = renderDialog();

      fireEvent.change(oldAddress(), { target: { value: '/old-page' } });
      choose(/Un altro indirizzo/);
      fireEvent.change(screen.getByLabelText('Indirizzo'), {
        target: { value: '/it/new-page' },
      });
      submit();

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          from: '/old-page',
          to: { kind: 'url', url: '/it/new-page' },
          status: 301,
        }),
      );
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('sends it as temporary when that is chosen, and says what it means', async () => {
      const { onSubmit } = renderDialog();
      fireEvent.change(oldAddress(), { target: { value: '/old-page' } });
      choose(/Un altro indirizzo/);
      fireEvent.change(screen.getByLabelText('Indirizzo'), {
        target: { value: '/it/new-page' },
      });

      fireEvent.click(screen.getByRole('radio', { name: 'Temporaneo' }));
      expect(
        screen.getByText(/I motori di ricerca tengono il vecchio indirizzo/),
      ).toBeTruthy();
      submit();

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ status: 302 }),
        ),
      );
    });

    it('says an address is gone, with no destination and no kind to choose', async () => {
      const { onSubmit } = renderDialog();
      fireEvent.change(oldAddress(), { target: { value: '/removed' } });

      choose(/Da nessuna parte/);

      expect(screen.queryByRole('radio', { name: 'Permanente' })).toBeNull();
      submit();
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          from: '/removed',
          to: null,
          status: 410,
        }),
      );
    });

    it('sends a page chosen from the site’s own, in the language it was chosen in', async () => {
      const { onSubmit } = renderDialog();
      fireEvent.change(oldAddress(), { target: { value: '/old-about' } });

      fireEvent.click(
        screen.getByRole('button', { name: 'Scegli una pagina' }),
      );
      const picker = await screen.findByRole('dialog', {
        name: 'Scegli una pagina',
      });
      fireEvent.click(await within(picker).findByText('Chi siamo'));

      expect(await screen.findByText('Chi siamo')).toBeTruthy();
      submit();
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          from: '/old-about',
          to: { kind: 'page', pageGroupId: 'group-about', locale: 'it' },
          status: 301,
        }),
      );
    });

    it('asks for the language only where the site has more than one, and forgets the page when it changes', async () => {
      renderDialog({ enabledLocales: ['it', 'en'] });
      fireEvent.change(oldAddress(), { target: { value: '/old-about' } });
      fireEvent.click(
        screen.getByRole('button', { name: 'Scegli una pagina' }),
      );
      const picker = await screen.findByRole('dialog', {
        name: 'Scegli una pagina',
      });
      fireEvent.click(await within(picker).findByText('Chi siamo'));
      await screen.findByRole('button', { name: 'Cambia pagina' });

      chooseOption(screen.getByRole('combobox', { name: 'Lingua' }), 'inglese');

      expect(screen.getByText('Nessuna pagina scelta')).toBeTruthy();
    });

    it('does not ask a one-language site which language', () => {
      renderDialog();

      expect(screen.queryByRole('combobox', { name: 'Lingua' })).toBeNull();
    });
  });

  describe('what is missing', () => {
    it('says so under the old address, and sends nothing', () => {
      const { onSubmit } = renderDialog();

      submit();

      expect(screen.getByRole('alert').textContent).toBe(
        'Scrivi l’indirizzo vecchio.',
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('says a page has to be chosen, and sends nothing', () => {
      const { onSubmit } = renderDialog();
      fireEvent.change(oldAddress(), { target: { value: '/old' } });

      submit();

      expect(
        screen.getByText('Scegli la pagina a cui mandare i visitatori.'),
      ).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('when the server refuses', () => {
    async function submitRefused(code: string) {
      const onSubmit = vi
        .fn()
        .mockRejectedValue(new ApiError(400, { message: code }));
      const { onOpenChange } = renderDialog({ onSubmit });
      fireEvent.change(oldAddress(), { target: { value: '/old-page' } });
      choose(/Un altro indirizzo/);
      fireEvent.change(screen.getByLabelText('Indirizzo'), {
        target: { value: '/it/new-page' },
      });
      await act(async () => submit());
      return { onSubmit, onOpenChange };
    }

    it('says a problem with the old address under it, and keeps what was typed', async () => {
      const { onOpenChange } = await submitRefused(
        'redirect:source:taken:/old-page',
      );

      expect((await screen.findByRole('alert')).textContent).toBe(
        'C’è già un reindirizzamento per questo indirizzo.',
      );
      expect(instanceOf(oldAddress(), HTMLInputElement).value).toBe(
        '/old-page',
      );
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('says a problem with the destination under the choice, in the editor’s words', async () => {
      await submitRefused('redirect:target:loop');

      expect(
        await screen.findByText(
          'Questa destinazione rimanda qui: i visitatori girerebbero in tondo.',
        ),
      ).toBeTruthy();
      expect(
        instanceOf(screen.getByLabelText('Indirizzo'), HTMLInputElement).value,
      ).toBe('/it/new-page');
    });

    it('says what it could not do when the refusal is not about the rule', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error('network'));
      renderDialog({ onSubmit });
      fireEvent.change(oldAddress(), { target: { value: '/old-page' } });
      choose(/Un altro indirizzo/);
      fireEvent.change(screen.getByLabelText('Indirizzo'), {
        target: { value: '/it/new-page' },
      });

      await act(async () => submit());

      expect(
        await screen.findByText(
          'Non è stato possibile salvare il reindirizzamento.',
        ),
      ).toBeTruthy();
    });
  });

  describe('a path that is the destination', () => {
    it('says no page answers there, while it is typed', async () => {
      vi.mocked(redirectsApi.testRedirect).mockResolvedValue({
        outcome: 'none',
      });
      renderDialog();
      choose(/Un altro indirizzo/);

      fireEvent.change(screen.getByLabelText('Indirizzo'), {
        target: { value: '/it/chi-sieme' },
      });

      expect(
        await screen.findByText(/non risponde nessuna pagina/, undefined, {
          timeout: 2000,
        }),
      ).toBeTruthy();
      expect(redirectsApi.testRedirect).toHaveBeenCalledWith(
        'site-1',
        '/it/chi-sieme',
      );
    });

    it('does not ask about another site’s address, and says it does not', async () => {
      renderDialog();
      choose(/Un altro indirizzo/);

      fireEvent.change(screen.getByLabelText('Indirizzo'), {
        target: { value: 'https://new-site.com/page' },
      });

      expect(
        await screen.findByText(
          /di un altro sito: qui non viene controllato/,
          undefined,
          {
            timeout: 2000,
          },
        ),
      ).toBeTruthy();
      expect(redirectsApi.testRedirect).not.toHaveBeenCalled();
    });
  });

  describe('editing', () => {
    it('opens on the rule, with its page and its kind', () => {
      renderDialog({
        redirect: buildRedirectRecord({
          from: '/old-about',
          target: {
            kind: 'page',
            pageGroupId: 'group-about',
            locale: 'it',
            title: 'Chi siamo',
            path: '/it/chi-siamo',
            isPublished: true,
          },
          status: 302,
        }),
      });

      expect(instanceOf(oldAddress(), HTMLInputElement).value).toBe(
        '/old-about',
      );
      expect(screen.getByText('Chi siamo')).toBeTruthy();
      expect(
        screen
          .getByRole('radio', { name: 'Temporaneo' })
          .getAttribute('aria-checked'),
      ).toBe('true');
      expect(
        screen.getByRole('button', { name: 'Salva le modifiche' }),
      ).toBeTruthy();
    });

    it('opens a rule whose page was deleted on an open choice', () => {
      renderDialog({
        redirect: buildRedirectRecord({
          target: {
            kind: 'page',
            pageGroupId: null,
            locale: 'it',
            title: null,
            path: null,
            isPublished: false,
          },
          needsATarget: true,
        }),
      });

      expect(screen.getByText('Nessuna pagina scelta')).toBeTruthy();
    });
  });

  describe('in a demo', () => {
    it('says an address has to be a path of the site', async () => {
      vi.mocked(deployment.getDeployment).mockResolvedValue(
        deploymentRecord({ demo: true }),
      );
      renderDialog();

      expect(
        await screen.findByText('Un percorso di questo sito.'),
      ).toBeTruthy();
    });
  });
});
