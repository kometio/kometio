import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { FormField } from '@kometio/shared-types';
import * as api from '../../lib/forms-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { ApiError } from '../../lib/http-client';
import { buildSiteRecord } from '@kometio/testing/records';
import { TooltipProvider } from '../../components/ui/tooltip';
import * as sitesApi from '../../lib/sites-api-client';
import { sessionAs } from '../../test/current-session.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import { FormSubmissionsList } from './form-submissions-list';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, getCurrentSite: vi.fn() };
});

beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
  vi.mocked(sitesApi.getCurrentSite).mockResolvedValue(buildSiteRecord());
});

// `Link` needs a router context this component-only render does not have.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
}));

vi.mock('../../lib/forms-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/forms-api-client')>();
  return {
    ...actual,
    listFormSubmissions: vi.fn(),
    deleteFormSubmission: vi.fn(),
  };
});

const FIELDS: FormField[] = [
  { id: 'name', label: 'Nome', type: 'text', required: true },
  { id: 'note', label: 'Messaggio', type: 'textarea', required: false },
];

function renderList(
  items: {
    id: string;
    payload: Record<string, unknown>;
    createdAt: string;
    pageId?: string | null;
  }[],
  fields = FIELDS,
  pages: api.SubmissionOriginPageRecord[] = [],
  options: {
    page?: number;
    total?: number;
    onPageChange?: (p: number) => void;
  } = {},
) {
  vi.mocked(api.listFormSubmissions).mockResolvedValue({
    items: items.map((item) => ({ pageId: null, ...item })),
    total: options.total ?? items.length,
    fields,
    pages,
  });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <TooltipProvider>
          <FormSubmissionsList
            formId="f1"
            page={options.page ?? 1}
            onPageChange={options.onPageChange ?? vi.fn()}
          />
        </TooltipProvider>
      </WithToasts>
    </QueryClientProvider>,
  );
}

const AT = '2026-09-04T09:10:00.000Z';

describe('FormSubmissionsList', () => {
  it('says so plainly when nothing has come in', async () => {
    renderList([]);

    expect(
      await screen.findByText(/compariranno qui|will show up here/i),
    ).toBeTruthy();
  });

  it('shows an answer under its field label once expanded', async () => {
    renderList([
      { id: 's1', payload: { name: 'Mario', note: 'Ciao' }, createdAt: AT },
    ]);

    fireEvent.click(await screen.findByRole('button', { expanded: false }));

    expect(screen.getByText('Messaggio')).toBeTruthy();
    expect(screen.getByText('Ciao')).toBeTruthy();
  });

  it('keeps an answer whose field was removed, and marks it as such', async () => {
    // The case the whole shape of this view exists for: a payload is keyed
    // by field id, and the form's fields change afterwards. Dropping the
    // value would silently lose something a person actually typed.
    renderList([
      { id: 's1', payload: { name: 'Mario', azienda: 'Acme' }, createdAt: AT },
    ]);

    fireEvent.click(await screen.findByRole('button', { expanded: false }));

    expect(screen.getByText('Acme')).toBeTruthy();
    expect(
      screen.getByText(/non è più nel modulo|no longer in this form/i),
    ).toBeTruthy();
  });

  it('renders a file answer as a download link, not [object Object]', async () => {
    renderList([
      {
        id: 's1',
        payload: { name: { filename: 'cv.pdf', url: 'https://x/cv.pdf' } },
        createdAt: AT,
      },
    ]);

    fireEvent.click(await screen.findByRole('button', { expanded: false }));

    const link = screen.getByRole('link', { name: /cv\.pdf/ });
    expect(link.getAttribute('href')).toBe('https://x/cv.pdf');
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });

  it('says which page a submission was filled on, and links to it', async () => {
    renderList(
      [{ id: 's1', payload: { name: 'Mario' }, createdAt: AT, pageId: 'pt-1' }],
      FIELDS,
      [
        {
          id: 'pt-1',
          pageGroupId: 'group-1',
          locale: 'it',
          title: 'Contatti',
        },
      ],
    );

    fireEvent.click(await screen.findByRole('button', { name: /Mario/ }));

    const link = screen.getByRole('link', { name: 'Contatti' });
    expect(link.getAttribute('href')).toBe('/page-groups/group-1');
  });

  it('shows no page for a submission that carries none', async () => {
    // Every submission recorded before the public site knew which page it
    // was rendering, and every one whose page has since been deleted.
    renderList([{ id: 's1', payload: { name: 'Mario' }, createdAt: AT }]);

    fireEvent.click(await screen.findByRole('button', { name: /Mario/ }));

    expect(screen.queryByRole('link', { name: 'Contatti' })).toBeNull();
    expect(
      screen.queryByText(/Inviato dalla pagina|Submitted from/i),
    ).toBeNull();
  });

  it('offers the export only when there is something to export', async () => {
    renderList([]);

    expect(
      await screen.findByText(/compariranno qui|will show up here/i),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: /csv/i })).toBeNull();
  });

  it('links the export to the CSV endpoint when there is', async () => {
    renderList([{ id: 's1', payload: { name: 'Mario' }, createdAt: AT }]);

    const link = await screen.findByRole('link', { name: /csv/i });
    expect(link.getAttribute('href')).toContain('/forms/f1/submissions.csv');
  });

  /*
   * How long the answers are kept is one setting for the whole site, in
   * Settings, where nobody reading a form's answers would look. It is said
   * where the answers are, with the way to change it.
   */
  it('says how long the answers are kept, and links to where that is set', async () => {
    renderList([]);

    expect(
      await screen.findByText(/le risposte vengono conservate per sempre/i),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Cambia' }).getAttribute('href'),
    ).toBe('/settings/retention');
  });

  it('says after how many days they go, when the site deletes them', async () => {
    vi.mocked(sitesApi.getCurrentSite).mockResolvedValue(
      buildSiteRecord({ formSubmissionRetentionDays: 90 }),
    );
    renderList([]);

    expect(await screen.findByText(/eliminate dopo 90 giorni/i)).toBeTruthy();
  });

  it('offers no way to change it to a role that may not configure the site', async () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderList([]);

    await screen.findByText(/le risposte vengono conservate per sempre/i);
    expect(screen.queryByRole('link', { name: 'Cambia' })).toBeNull();
  });

  it('exports the answers with a button that says so', async () => {
    renderList([{ id: 's1', payload: { name: 'Mario' }, createdAt: AT }]);

    const link = await screen.findByRole('link', { name: 'Esporta CSV' });
    expect(link.getAttribute('href')).toContain('/forms/f1/submissions.csv');
    expect(link.querySelector('svg')).toBeTruthy();
  });

  it('pages through the answers by the address it is given', async () => {
    const onPageChange = vi.fn();
    renderList(
      [{ id: 's1', payload: { name: 'Mario' }, createdAt: AT }],
      FIELDS,
      [],
      { page: 2, total: 60, onPageChange },
    );

    expect(await screen.findByText('Pagina 2 di 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pagina successiva' }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  describe('deleting one answer', () => {
    beforeEach(() => {
      vi.mocked(api.deleteFormSubmission).mockReset();
    });

    const answers = [
      { id: 's1', payload: { name: 'Mario' }, createdAt: AT },
      { id: 's2', payload: { name: 'Giulia' }, createdAt: AT },
    ];

    async function openFirst() {
      fireEvent.click(
        (await screen.findAllByRole('button', { expanded: false }))[0],
      );
    }

    it('offers it inside the opened answer, where it is plain which one it is', async () => {
      renderList(answers);
      await screen.findAllByRole('button', { expanded: false });
      expect(
        screen.queryByRole('button', { name: 'Elimina questa risposta' }),
      ).toBeNull();

      await openFirst();

      expect(
        screen.getByRole('button', { name: 'Elimina questa risposta' }),
      ).toBeTruthy();
    });

    it('asks first, says it cannot be recovered, and does nothing until the answer is yes', async () => {
      vi.mocked(api.deleteFormSubmission).mockResolvedValue(undefined);
      renderList(answers);
      await openFirst();

      fireEvent.click(
        screen.getByRole('button', { name: 'Elimina questa risposta' }),
      );

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toMatch(/non potrà essere recuperata/i);
      // The files go with it at once, not with the night's clean-up.
      expect(dialog.textContent).toMatch(/file allegati vengono eliminati/i);
      expect(dialog.textContent).not.toMatch(/notturna/i);
      expect(api.deleteFormSubmission).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

      await waitFor(() =>
        expect(api.deleteFormSubmission).toHaveBeenCalledWith('f1', 's1'),
      );
      expect(await screen.findByText('Risposta eliminata')).toBeTruthy();
    });

    it('does nothing when the question is answered No', async () => {
      renderList(answers);
      await openFirst();
      fireEvent.click(
        screen.getByRole('button', { name: 'Elimina questa risposta' }),
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(api.deleteFormSubmission).not.toHaveBeenCalled();
    });

    it("says the server's own sentence when it could not be deleted", async () => {
      vi.mocked(api.deleteFormSubmission).mockRejectedValue(
        new ApiError(404, { message: 'Form submission not found: s1' }),
      );
      renderList(answers);
      await openFirst();
      fireEvent.click(
        screen.getByRole('button', { name: 'Elimina questa risposta' }),
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Elimina' }));

      expect(
        await screen.findByText('Form submission not found: s1'),
      ).toBeTruthy();
    });

    it('offers nothing to a role that may not delete', async () => {
      vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
      renderList(answers);

      await openFirst();

      expect(
        screen.queryByRole('button', { name: 'Elimina questa risposta' }),
      ).toBeNull();
    });
  });
});
