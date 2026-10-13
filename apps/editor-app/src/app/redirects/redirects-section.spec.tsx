import { useState } from 'react';
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
  buildMissingPathRecord,
  buildRedirectRecord,
} from '@kometio/testing/records';
import * as deployment from '../../lib/deployment-api-client';
import * as api from '../../lib/redirects-api-client';
import { ApiError } from '../../lib/http-client';
import { WithToasts } from '../../test/toasts.test-fixture';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { deploymentRecord } from '../../test/deployment.test-fixture';
import { sessionAs } from '../../test/current-session.test-fixture';
import { chooseOption } from '../../test/select.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import { RedirectsSection } from './redirects-section';
import {
  redirectsSearchSchema,
  type RedirectsSearch,
} from './redirects-search';

vi.mock('../auth/use-current-session', () => ({
  useCurrentSession: vi.fn(),
}));

vi.mock('../../lib/deployment-api-client', () => ({
  getDeployment: vi.fn(),
}));

vi.mock('../../lib/redirects-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/redirects-api-client')>();
  return {
    ...actual,
    listRedirects: vi.fn(),
    listMissingPaths: vi.fn(),
    createRedirect: vi.fn(),
    updateRedirect: vi.fn(),
    deleteRedirect: vi.fn(),
    dismissMissingPath: vi.fn(),
    importRedirects: vi.fn(),
    testRedirect: vi.fn(),
  };
});

function Harness({ initial }: { initial: Partial<RedirectsSearch> }) {
  const [search, setSearch] = useState<RedirectsSearch>(
    redirectsSearchSchema.parse(initial),
  );
  return (
    <RedirectsSection
      siteId="site-1"
      defaultLocale="it"
      enabledLocales={['it']}
      search={search}
      onSearchChange={setSearch}
    />
  );
}

function renderSection(initial: Partial<RedirectsSearch> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <Harness initial={initial} />
      </WithToasts>
    </QueryClientProvider>,
  );
}

const about = buildRedirectRecord({
  id: 'r-about',
  from: '/2019/05/chi-siamo',
  target: {
    kind: 'page',
    pageGroupId: 'g-about',
    locale: 'it',
    title: 'Chi siamo',
    path: '/it/chi-siamo',
    isPublished: true,
  },
  hits: 12,
  lastHitAt: '2026-10-01T10:00:00.000Z',
});
const pattern = buildRedirectRecord({
  id: 'r-pattern',
  from: '/:year/:month/:slug',
  kind: 'pattern',
  target: { kind: 'url', url: '/it/blog/:slug' },
  origin: 'wordpress',
});
const orphan = buildRedirectRecord({
  id: 'r-orphan',
  from: '/vecchia-offerta',
  target: {
    kind: 'page',
    pageGroupId: null,
    locale: 'it',
    title: null,
    path: null,
    isPublished: false,
  },
  needsATarget: true,
});
const removed = buildRedirectRecord({
  id: 'r-removed',
  from: '/rimossa',
  target: null,
  status: 410,
});
const draft = buildRedirectRecord({
  id: 'r-draft',
  from: '/bozza',
  target: {
    kind: 'page',
    pageGroupId: 'g-draft',
    locale: 'it',
    title: 'Nuova offerta',
    path: null,
    isPublished: false,
  },
});

describe('RedirectsSection', () => {
  beforeEach(() => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
    vi.mocked(deployment.getDeployment).mockResolvedValue(deploymentRecord());
    vi.mocked(api.listRedirects).mockResolvedValue({
      items: [about, pattern, orphan, removed, draft],
      total: 5,
    });
    vi.mocked(api.listMissingPaths).mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('the list', () => {
    it('says each rule as a sentence: where it comes from, where it goes, what happened since', async () => {
      renderSection();

      const row = (await screen.findByText('/2019/05/chi-siamo')).closest('li');
      expect(row).not.toBeNull();
      const inRow = within(row as HTMLElement);
      expect(inRow.getByText('Chi siamo')).toBeTruthy();
      expect(inRow.getByText('/it/chi-siamo')).toBeTruthy();
      expect(inRow.getByText('Permanente')).toBeTruthy();
      expect(inRow.getByText(/12 visite/)).toBeTruthy();
    });

    it('marks a pattern, and where a rule came from when it was not typed here', async () => {
      renderSection();

      const row = (await screen.findByText('/:year/:month/:slug')).closest(
        'li',
      ) as HTMLElement;

      expect(within(row).getByText('Schema')).toBeTruthy();
      expect(within(row).getByText('Da WordPress')).toBeTruthy();
      expect(within(row).getByText('/it/blog/:slug')).toBeTruthy();
    });

    it('says in words what needs a look: a rule with no page, a page not yet published, an address that is gone', async () => {
      renderSection();

      const orphanRow = (await screen.findByText('/vecchia-offerta')).closest(
        'li',
      ) as HTMLElement;
      expect(
        within(orphanRow).getByText('Serve una destinazione'),
      ).toBeTruthy();
      expect(
        within(orphanRow).getByText(
          /La pagina a cui portava è stata eliminata/,
        ),
      ).toBeTruthy();

      const draftRow = screen.getByText('/bozza').closest('li') as HTMLElement;
      expect(within(draftRow).getByText('Pagina non pubblicata')).toBeTruthy();

      const goneRow = screen.getByText('/rimossa').closest('li') as HTMLElement;
      expect(
        within(goneRow).getByText('Rimosso per sempre (410)'),
      ).toBeTruthy();
    });

    it('says what it is for, and what to do first, when there is none', async () => {
      vi.mocked(api.listRedirects).mockResolvedValue({ items: [], total: 0 });

      renderSection();

      expect(await screen.findByText('Nessun reindirizzamento')).toBeTruthy();
      expect(screen.getByText(/Arrivi da un altro sito/)).toBeTruthy();
    });

    it('says a search matched nothing, and puts everything back', async () => {
      vi.mocked(api.listRedirects).mockImplementation(
        async (_site, _page, _size, filters) =>
          filters?.search
            ? { items: [], total: 0 }
            : { items: [about], total: 1 },
      );
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');

      fireEvent.change(screen.getByRole('searchbox'), {
        target: { value: 'zzz' },
      });

      expect(
        await screen.findByText(
          'Nessun reindirizzamento corrisponde alla ricerca.',
          undefined,
          { timeout: 2000 },
        ),
      ).toBeTruthy();
      expect(api.listRedirects).toHaveBeenLastCalledWith(
        'site-1',
        1,
        expect.any(Number),
        { search: 'zzz' },
      );

      fireEvent.click(screen.getByRole('button', { name: 'Mostra tutti' }));

      expect(await screen.findByText('/2019/05/chi-siamo')).toBeTruthy();
      expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
        '',
      );
    });

    it('narrows to what needs a destination, asking the server', async () => {
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');

      chooseOption(
        screen.getByRole('combobox', { name: 'Mostra' }),
        'Senza destinazione',
      );

      await waitFor(() =>
        expect(api.listRedirects).toHaveBeenLastCalledWith(
          'site-1',
          1,
          expect.any(Number),
          { needsATarget: true },
        ),
      );
    });

    it('says the list could not be loaded', async () => {
      vi.mocked(api.listRedirects).mockRejectedValue(new Error('down'));

      renderSection();

      expect(
        await screen.findByText(
          'Non è stato possibile caricare i reindirizzamenti.',
        ),
      ).toBeTruthy();
    });
  });

  describe('adding and editing', () => {
    it('adds a rule and says so', async () => {
      vi.mocked(api.createRedirect).mockResolvedValue(about);
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');

      fireEvent.click(
        screen.getByRole('button', { name: 'Aggiungi reindirizzamento' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Aggiungi un reindirizzamento',
      });
      fireEvent.change(within(dialog).getByLabelText('Indirizzo vecchio'), {
        target: { value: '/old' },
      });
      fireEvent.click(
        within(dialog).getByRole('radio', { name: /Da nessuna parte/ }),
      );
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: 'Aggiungi reindirizzamento',
          }),
        );
      });

      await waitFor(() =>
        expect(api.createRedirect).toHaveBeenCalledWith({
          siteId: 'site-1',
          from: '/old',
          to: null,
          status: 410,
        }),
      );
      expect(await screen.findByText('Reindirizzamento aggiunto')).toBeTruthy();
    });

    it('edits a rule, sending the whole of it', async () => {
      vi.mocked(api.updateRedirect).mockResolvedValue(about);
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Modifica il reindirizzamento da /2019/05/chi-siamo',
        }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Modifica reindirizzamento',
      });
      fireEvent.click(
        within(dialog).getByRole('radio', { name: 'Temporaneo' }),
      );
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Salva le modifiche' }),
        );
      });

      await waitFor(() =>
        expect(api.updateRedirect).toHaveBeenCalledWith('r-about', {
          from: '/2019/05/chi-siamo',
          to: { kind: 'page', pageGroupId: 'g-about', locale: 'it' },
          status: 302,
        }),
      );
      expect(await screen.findByText('Reindirizzamento salvato')).toBeTruthy();
    });
  });

  describe('deleting', () => {
    it('asks first, naming what goes, and deletes what was ticked', async () => {
      vi.mocked(api.deleteRedirect).mockResolvedValue(undefined);
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');

      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'Seleziona il reindirizzamento da /2019/05/chi-siamo',
        }),
      );
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'Seleziona il reindirizzamento da /rimossa',
        }),
      );
      expect(screen.getByText('2 selezionati')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

      const dialog = await screen.findByRole('alertdialog');
      expect(
        within(dialog).getByText(/\/2019\/05\/chi-siamo, \/rimossa/),
      ).toBeTruthy();
      expect(api.deleteRedirect).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Elimina' }),
        );
      });

      await waitFor(() => expect(api.deleteRedirect).toHaveBeenCalledTimes(2));
      expect(api.deleteRedirect).toHaveBeenCalledWith('r-about');
      expect(api.deleteRedirect).toHaveBeenCalledWith('r-removed');
      expect(
        await screen.findByText('2 reindirizzamenti eliminati'),
      ).toBeTruthy();
    });

    it('says what went, and what was left, when one cannot be deleted', async () => {
      vi.mocked(api.deleteRedirect)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ApiError(500, {}));
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'Seleziona il reindirizzamento da /2019/05/chi-siamo',
        }),
      );
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'Seleziona il reindirizzamento da /rimossa',
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
      const dialog = await screen.findByRole('alertdialog');

      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Elimina' }),
        );
      });

      expect(
        await screen.findByText(
          'Non è stato possibile eliminare i reindirizzamenti.',
        ),
      ).toBeTruthy();
      expect(
        await screen.findByText('Reindirizzamento eliminato'),
      ).toBeTruthy();
    });
  });

  describe('what was not found', () => {
    beforeEach(() => {
      vi.mocked(api.listMissingPaths).mockResolvedValue({
        items: [
          buildMissingPathRecord({
            id: 'm1',
            path: '/2019/05/old-post',
            hits: 7,
          }),
        ],
        total: 1,
      });
    });

    it('counts them in the tab, so that it is seen without being opened', async () => {
      renderSection();

      expect(
        await screen.findByRole('tab', { name: 'Non trovati (1)' }),
      ).toBeTruthy();
    });

    it('lists them and starts a rule for one, with its address already in', async () => {
      renderSection({ tab: 'missing' });

      expect(await screen.findByText('/2019/05/old-post')).toBeTruthy();
      expect(screen.getByText(/7 visite/)).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Aggiungi un reindirizzamento per /2019/05/old-post',
        }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: 'Aggiungi un reindirizzamento',
      });
      expect(
        (within(dialog).getByLabelText('Indirizzo vecchio') as HTMLInputElement)
          .value,
      ).toBe('/2019/05/old-post');
    });

    it('takes one off the list when it is not worth a rule', async () => {
      vi.mocked(api.dismissMissingPath).mockResolvedValue(undefined);
      renderSection({ tab: 'missing' });
      await screen.findByText('/2019/05/old-post');

      fireEvent.click(
        screen.getByRole('button', { name: 'Ignora /2019/05/old-post' }),
      );

      await waitFor(() =>
        expect(api.dismissMissingPath).toHaveBeenCalledWith('m1'),
      );
      expect(
        await screen.findByText('/2019/05/old-post tolto dall’elenco'),
      ).toBeTruthy();
    });

    it('says what it is when nothing was missed', async () => {
      vi.mocked(api.listMissingPaths).mockResolvedValue({
        items: [],
        total: 0,
      });
      renderSection({ tab: 'missing' });

      expect(await screen.findByText(/Qui non c’è nulla/)).toBeTruthy();
      expect(screen.getByText(/mai chi l’ha chiesto/)).toBeTruthy();
    });
  });

  describe('checking an address', () => {
    it('says what a visitor gets, and offers a rule when nothing answers', async () => {
      vi.mocked(api.testRedirect).mockResolvedValue({ outcome: 'none' });
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');

      fireEvent.click(
        screen.getByRole('button', { name: 'Verifica un indirizzo' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Verifica un indirizzo',
      });
      fireEvent.change(within(dialog).getByLabelText('Indirizzo'), {
        target: { value: '/lost' },
      });
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Verifica' }),
        );
      });

      expect(
        await within(dialog).findByText(/Lì non risponde nulla/),
      ).toBeTruthy();
      fireEvent.click(
        within(dialog).getByRole('button', {
          name: 'Aggiungi un reindirizzamento',
        }),
      );
      const add = await screen.findByRole('dialog', {
        name: 'Aggiungi un reindirizzamento',
      });
      expect(
        (within(add).getByLabelText('Indirizzo vecchio') as HTMLInputElement)
          .value,
      ).toBe('/lost');
    });
  });

  describe('importing', () => {
    it('shows what a list would do before doing it, and does it when asked', async () => {
      vi.mocked(api.importRedirects).mockImplementation(async (input) => ({
        rows: [
          { line: 2, from: '/a', to: '/it/a', outcome: 'created' },
          {
            line: 3,
            from: '/api/x',
            to: '/it/x',
            outcome: 'error',
            side: 'source',
            problem: 'reserved',
            detail: 'api',
          },
        ],
        created: 1,
        updated: 0,
        unchanged: 0,
        failed: 1,
        truncated: false,
        applied: !input.dryRun,
      }));
      renderSection();
      await screen.findByText('/2019/05/chi-siamo');

      fireEvent.click(
        screen.getByRole('button', { name: 'Importa un elenco' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Importa un elenco di reindirizzamenti',
      });
      fireEvent.change(
        within(dialog).getByLabelText('Oppure incolla qui l’elenco'),
        {
          target: { value: 'from,to\n/a,/it/a\n/api/x,/it/x\n' },
        },
      );
      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'Controlla l’elenco' }),
        );
      });

      expect(
        await within(dialog).findByText('1 nuovo · 1 con un problema'),
      ).toBeTruthy();
      expect(within(dialog).getByText('Riga 3')).toBeTruthy();
      expect(
        within(dialog).getByText(
          /«\/api» è un indirizzo che il sito gestisce da sé/,
        ),
      ).toBeTruthy();
      expect(api.importRedirects).toHaveBeenCalledWith({
        siteId: 'site-1',
        csv: 'from,to\n/a,/it/a\n/api/x,/it/x\n',
        dryRun: true,
      });

      await act(async () => {
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: 'Importa 1 reindirizzamento',
          }),
        );
      });

      await waitFor(() =>
        expect(api.importRedirects).toHaveBeenLastCalledWith({
          siteId: 'site-1',
          csv: 'from,to\n/a,/it/a\n/api/x,/it/x\n',
          dryRun: false,
        }),
      );
      expect(
        await screen.findByText(
          'Importazione completata. Nuovi: 1, modificati: 0.',
        ),
      ).toBeTruthy();
    });
  });
});
