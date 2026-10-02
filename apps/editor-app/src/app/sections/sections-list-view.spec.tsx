import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WithToasts } from '../../test/toasts.test-fixture';
import { ApiError } from '../../lib/http-client';
import type { ReusableSectionListItem } from '../../lib/reusable-sections-api-client';
import * as sectionsApi from '../../lib/reusable-sections-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildReusableSectionListItem } from '@kometio/testing/records';
import { reusableSectionsQueryOptions } from './reusable-sections-queries';
import { SectionsListView } from './sections-list-view';
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
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
    useNavigate: vi.fn(),
  };
});

vi.mock('../../lib/reusable-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/reusable-sections-api-client')
    >();
  return {
    ...actual,
    deleteReusableSection: vi.fn(),
    createReusableSection: vi.fn(),
  };
});

function section(
  overrides: Partial<ReusableSectionListItem>,
): ReusableSectionListItem {
  return buildReusableSectionListItem({
    name: 'Newsletter',
    status: 'published',
    publishedContent: [],
    ...overrides,
  });
}

function renderList(
  sections: ReusableSectionListItem[],
  props: Partial<Parameters<typeof SectionsListView>[0]> = {},
) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    reusableSectionsQueryOptions('site-1').queryKey,
    sections,
  );
  const onKindChange = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <WithToasts>
        <SectionsListView
          siteId="site-1"
          kind="shared"
          onKindChange={onKindChange}
          {...props}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
  return { onKindChange };
}

describe('SectionsListView — where a shared section is used', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /*
   * The newsletter inside a template (docs/adr/0072): it stands on the
   * pages made so far AND in the template that makes the next ones, and
   * the list is where somebody looks before deleting it.
   */
  it('counts the templates that hold it beside the pages that show it', () => {
    renderList([
      section({
        id: 'a',
        name: 'Newsletter',
        usedOnPages: 2,
        usedInTemplates: 1,
      }),
      section({ id: 'b', name: 'Banner', usedInTemplates: 3 }),
      section({ id: 'c', name: 'Unused' }),
    ]);

    expect(screen.getByText('su 2 pagine · in 1 template')).toBeTruthy();
    expect(screen.getByText('in 3 template')).toBeTruthy();
    expect(
      screen.getByText('non ancora inserita da nessuna parte'),
    ).toBeTruthy();
  });

  it('warns, before deleting, about the pages still to be made from a template', () => {
    renderList([
      section({ name: 'Newsletter', usedOnPages: 2, usedInTemplates: 1 }),
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Elimina “Newsletter”' }),
    );

    const dialog = screen.getByRole('alertdialog');
    within(dialog).getByText('Eliminare “Newsletter”?');
    within(dialog).getByText(
      'È su 2 pagine, e ognuna non mostrerà più niente al suo posto. Sta anche dentro un template: le pagine create da lì in poi avranno una striscia vuota al suo posto.',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sectionsApi.deleteReusableSection).not.toHaveBeenCalled();
  });

  // "È su 1 pagine" was what one page used to read.
  it('says one page in the singular, and deletes once confirmed', async () => {
    renderList([section({ id: 'section-1', usedOnPages: 1 })]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Elimina “Newsletter”' }),
    );
    const dialog = screen.getByRole('alertdialog');
    within(dialog).getByText(
      'È su una pagina, che non mostrerà più niente al suo posto.',
    );

    fireEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));
    await waitFor(() =>
      expect(sectionsApi.deleteReusableSection).toHaveBeenCalledWith(
        'section-1',
      ),
    );
  });
});

describe('SectionsListView — the two lists', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const shared = section({ id: 'a', name: 'Newsletter', kind: 'shared' });
  const template = section({
    id: 'b',
    name: 'Scheda servizio',
    kind: 'template',
  });

  it('shows the shared sections on their tab and the templates on theirs', () => {
    renderList([shared, template]);
    expect(screen.getByText('Newsletter')).toBeTruthy();
    expect(screen.queryByText('Scheda servizio')).toBeNull();
    expect(
      screen.getByText(
        'Le modifichi una volta, e cambiano su ogni pagina che le usa.',
      ),
    ).toBeTruthy();
  });

  it('shows the templates when that is the tab, with the sentence that tells them apart', () => {
    renderList([shared, template], { kind: 'template' });

    expect(screen.getByText('Scheda servizio')).toBeTruthy();
    expect(screen.queryByText('Newsletter')).toBeNull();
    expect(
      screen.getByText(
        'Punti di partenza: una pagina li copia e poi va per conto suo.',
      ),
    ).toBeTruthy();
    // Nothing points back from a copy, so there is nothing to count.
    expect(screen.queryByText(/non ancora inserita/)).toBeNull();
  });

  it('changes the list through the address', () => {
    const { onKindChange } = renderList([shared, template]);

    fireEvent.click(screen.getByRole('tab', { name: 'Template' }));

    expect(onKindChange).toHaveBeenCalledWith('template');
  });

  it('says a state in a badge, not in a line of text', () => {
    renderList([
      section({ id: 'a', name: 'Newsletter', status: 'published' }),
      section({ id: 'b', name: 'Banner', status: 'draft' }),
    ]);

    const badgeOf = (name: string) =>
      screen
        .getByRole('link', { name })
        .closest('li')
        ?.querySelector('[data-slot="badge"]');
    expect(badgeOf('Newsletter')?.textContent).toBe('Pubblicata');
    expect(badgeOf('Banner')?.textContent).toBe('Bozza');
  });

  // The reason a template somebody made does not show in the page editor.
  it('says a template that is not published cannot be used on pages yet', () => {
    renderList(
      [
        section({
          id: 'd',
          name: 'Bozza',
          kind: 'template',
          status: 'draft',
          publishedContent: null,
        }),
        section({ id: 'p', name: 'Pronto', kind: 'template' }),
      ],
      { kind: 'template' },
    );

    expect(
      screen.getAllByText('Pubblicalo per poterlo usare nelle pagine.'),
    ).toHaveLength(1);
  });

  describe('making one', () => {
    it('names the kind on the button, asks only for a name, and opens the editor', async () => {
      const navigate = vi.fn();
      vi.mocked(router.useNavigate).mockReturnValue(navigate);
      vi.mocked(sectionsApi.createReusableSection).mockResolvedValue(
        section({ id: 'new-1', name: 'Nuova' }),
      );
      renderList([shared, template], { kind: 'template' });

      fireEvent.click(screen.getByRole('button', { name: 'Nuovo template' }));
      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'Scheda prodotto' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

      await waitFor(() =>
        expect(sectionsApi.createReusableSection).toHaveBeenCalledWith({
          siteId: 'site-1',
          name: 'Scheda prodotto',
          // Taken from the tab, not from a field.
          kind: 'template',
        }),
      );
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({
          to: '/sections/$sectionId',
          params: { sectionId: 'new-1' },
        }),
      );
    });

    it('says the name is taken, in the dialog, when it is', async () => {
      vi.mocked(router.useNavigate).mockReturnValue(vi.fn());
      vi.mocked(sectionsApi.createReusableSection).mockRejectedValue(
        new ApiError(409, { message: 'Conflict' }),
      );
      renderList([shared]);

      fireEvent.click(
        screen.getByRole('button', { name: 'Nuova sezione condivisa' }),
      );
      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'Newsletter' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Crea' }));

      expect(
        await screen.findByText('Esiste già una sezione con questo nome.'),
      ).toBeTruthy();
    });

    it('starts from the empty list too, with the same words', () => {
      renderList([]);

      expect(
        screen.getByText(/una sezione condivisa è una striscia di blocchi/i),
      ).toBeTruthy();
      // The header's, and the one that starts from the empty list.
      expect(
        screen.getAllByRole('button', { name: 'Nuova sezione condivisa' }),
      ).toHaveLength(2);
    });
  });

  it('offers deleting only to who may', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderList([shared]);

    expect(screen.queryByRole('button', { name: /^Elimina/ })).toBeNull();
  });

  it('says a section was deleted', async () => {
    vi.mocked(sectionsApi.deleteReusableSection).mockResolvedValue(undefined);
    renderList([shared]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Elimina “Newsletter”' }),
    );
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Elimina',
      }),
    );

    expect(
      await screen.findByText('“Newsletter” è stato eliminato'),
    ).toBeTruthy();
  });
});
