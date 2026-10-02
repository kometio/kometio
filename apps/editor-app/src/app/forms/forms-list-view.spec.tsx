import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import { WithToasts } from '../../test/toasts.test-fixture';
import { ApiError } from '../../lib/http-client';
import * as api from '../../lib/forms-api-client';
import type { FormRecord } from '../../lib/forms-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildFormRecord } from '@kometio/testing/records';
import { FormsListView } from './forms-list-view';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise: what each role is offered is
// decided by the permissions table, and tested where it is decided.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    // No router in these tests: the name of a form is a link, and what
    // matters here is where it points.
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

vi.mock('../../lib/forms-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/forms-api-client')>();
  return {
    ...actual,
    createForm: vi.fn(),
    deleteForm: vi.fn(),
    duplicateForm: vi.fn(),
  };
});

const formOne = buildFormRecord({
  name: 'Contact form',
  fields: [{ id: 'field-1', type: 'text', label: 'Nome', required: true }],
});
const formTwo = buildFormRecord({
  id: 'form-2',
  name: 'Newsletter',
  submissionCount: 3,
});

/** Ticks a form's box, the way a person does. */
function tick(name: string) {
  fireEvent.click(screen.getByRole('checkbox', { name: `Seleziona ${name}` }));
}

function renderView(
  forms: FormRecord[],
  options: { page?: number; total?: number } = {},
) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <FormsListView
          siteId="site-1"
          forms={forms}
          page={options.page ?? 1}
          total={options.total ?? forms.length}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('FormsListView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no forms', () => {
    renderView([]);

    // Says what a form is for, and puts the way to make one under it.
    expect(screen.getByText(/un modulo raccoglie/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Crea il primo modulo' }),
    ).toBeTruthy();
  });

  it('offers no way to make a form to somebody who may not, only what a form is', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderView([]);

    expect(screen.getByText(/un modulo raccoglie/i)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Crea il primo modulo' }),
    ).toBeNull();
  });

  it('starts the same dialog from the empty state as from New form', () => {
    renderView([]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Crea il primo modulo' }),
    );

    expect(screen.getByRole('dialog', { name: 'Nuovo modulo' })).toBeTruthy();
  });

  it('lists forms with their name and field count', () => {
    renderView([formOne]);

    expect(screen.getByText('Contact form')).toBeTruthy();
    expect(screen.getByText('1 campo')).toBeTruthy();
  });

  /*
   * The name is the way in. It used to be a button that selected the row
   * and then needed a second click on an icon with no words to open it.
   */
  it('makes the name of a form a link to its editor', () => {
    renderView([formOne]);

    expect(
      screen.getByRole('link', { name: 'Contact form' }).getAttribute('href'),
    ).toBe(`/forms/${formOne.id}`);
  });

  it('says what it holds under the name on a phone: answers, fields, the day', () => {
    renderView([formTwo]);

    const row = screen.getByRole('link', { name: 'Newsletter' }).closest('li');
    expect(row?.textContent).toContain('3 risposte');
    expect(row?.textContent).toContain('0 campi');
  });

  it('draws no bar until a form is ticked, then says how many and what can be done', () => {
    renderView([formOne, formTwo]);
    expect(
      screen.queryByRole('region', { name: /azioni sui moduli/i }),
    ).toBeNull();

    tick('Contact form');

    const bar = screen.getByRole('region', {
      name: 'Azioni sui moduli selezionati',
    });
    expect(bar.textContent).toContain('1 selezionato');
    // One form can be opened; two cannot be opened at once.
    expect(
      screen.getByRole('link', { name: 'Apri' }).getAttribute('href'),
    ).toBe(`/forms/${formOne.id}`);
    tick('Newsletter');
    expect(bar.textContent).toContain('2 selezionati');
    expect(screen.queryByRole('link', { name: 'Apri' })).toBeNull();
  });

  it('puts the selection away with Deselect', () => {
    renderView([formOne]);
    tick('Contact form');

    fireEvent.click(screen.getByRole('button', { name: 'Deseleziona' }));

    expect(
      screen.queryByRole('region', { name: /azioni sui moduli/i }),
    ).toBeNull();
  });

  it('deletes the selected form after confirming, and says how many answers go with it', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.deleteForm).mockResolvedValue(undefined);

    renderView([formTwo]);
    tick('Newsletter');
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    expect(screen.getByText('Eliminare questo modulo?')).toBeTruthy();
    // The one thing here that cannot be made again is said before it goes.
    expect(
      screen.getByText(/verranno eliminate anche le 3 risposte ricevute/i),
    ).toBeTruthy();
    expect(api.deleteForm).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Elimina',
      }),
    );

    await waitFor(() => expect(api.deleteForm).toHaveBeenCalledWith('form-2'));
    expect(
      await screen.findByText('Modulo “Newsletter” eliminato'),
    ).toBeTruthy();
  });

  it('deletes several forms one after another and says so once', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.deleteForm).mockResolvedValue(undefined);

    renderView([formOne, formTwo]);
    tick('Contact form');
    tick('Newsletter');
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    expect(screen.getByText('Eliminare 2 moduli?')).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Elimina',
      }),
    );

    await waitFor(() => expect(api.deleteForm).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('2 moduli eliminati')).toBeTruthy();
  });

  // A form that will not go must not take the rest down with it, nor be
  // reported as gone: what went through is said, and the one that did not
  // stays ticked with the reason.
  it('says why one form could not be deleted, and keeps it ticked', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.deleteForm)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError(500, { message: 'Storage is down' }));

    renderView([formOne, formTwo]);
    tick('Contact form');
    tick('Newsletter');
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Elimina',
      }),
    );

    expect(await screen.findByText('Storage is down')).toBeTruthy();
    expect(
      await screen.findByText('Modulo “Contact form” eliminato'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('checkbox', { name: 'Seleziona Newsletter' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('duplicates the one selected form under a name it is given, and offers the way to the copy', async () => {
    const navigate = vi.fn();
    vi.mocked(router.useNavigate).mockReturnValue(navigate);
    vi.mocked(api.duplicateForm).mockResolvedValue(
      buildFormRecord({ id: 'form-copy', name: 'Copia di Contact form' }),
    );
    renderView([formOne, formTwo]);

    tick('Contact form');
    fireEvent.click(screen.getByRole('button', { name: 'Duplica' }));
    // The name is proposed in the language of the editor, and can be changed.
    const field = screen.getByLabelText('Nome della copia') as HTMLInputElement;
    expect(field.value).toBe('Copia di Contact form');
    fireEvent.click(screen.getByRole('button', { name: 'Crea la copia' }));

    await waitFor(() =>
      expect(api.duplicateForm).toHaveBeenCalledWith(
        'form-1',
        'Copia di Contact form',
      ),
    );
    expect(
      await screen.findByText(
        /Modulo “Copia di Contact form” creato come copia/,
      ),
    ).toBeTruthy();
    // It stays on the list; the copy is one click away, not taken.
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apri la copia' }));
    expect(navigate).toHaveBeenCalledWith({
      to: '/forms/$formId',
      params: { formId: 'form-copy' },
    });
  });

  it('offers Duplicate for exactly one form, not for several', () => {
    renderView([formOne, formTwo]);

    tick('Contact form');
    expect(screen.getByRole('button', { name: 'Duplica' })).toBeTruthy();
    tick('Newsletter');

    expect(screen.queryByRole('button', { name: 'Duplica' })).toBeNull();
  });

  it('says why a form could not be duplicated, keeping the name typed', async () => {
    vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
    vi.mocked(api.duplicateForm).mockRejectedValue(
      new ApiError(404, { message: 'Form not found' }),
    );
    renderView([formOne]);
    tick('Contact form');
    fireEvent.click(screen.getByRole('button', { name: 'Duplica' }));

    fireEvent.click(screen.getByRole('button', { name: 'Crea la copia' }));

    expect(await screen.findByText('Form not found')).toBeTruthy();
    expect(
      (screen.getByLabelText('Nome della copia') as HTMLInputElement).value,
    ).toBe('Copia di Contact form');
  });

  it('opens the new form dialog', () => {
    renderView([]);

    fireEvent.click(screen.getByRole('button', { name: /nuovo modulo/i }));

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows pagination controls when there is more than one page', () => {
    renderView([formOne], { total: 40 });

    expect(screen.getByText('Pagina 1 di 2')).toBeTruthy();
  });
});

describe('FormsListView — what each role is offered (docs/roles.md)', () => {
  it('offers an editor neither a new form nor deleting one: a form is live once saved', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderView([formOne]);

    expect(screen.queryByRole('button', { name: /nuovo modulo/i })).toBeNull();
    tick('Contact form');
    expect(screen.getByRole('link', { name: 'Apri' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull();
    // Nor a copy: a copy is a new form, live at once.
    expect(screen.queryByRole('button', { name: 'Duplica' })).toBeNull();
  });
});
