import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildReusableSectionRecord } from '@kometio/testing/records';
import * as sectionsApi from '../../lib/reusable-sections-api-client';
import * as previewTokenApi from '../../lib/preview-token-api-client';
import { ApiError } from '../../lib/http-client';
import { WithToasts } from '../../test/toasts.test-fixture';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { sessionAs } from '../../test/current-session.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import { reusableSectionQueryOptions } from './reusable-sections-queries';
import { ReusableSectionEditorView } from './reusable-section-editor-view';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

vi.mock('../../lib/reusable-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/reusable-sections-api-client')
    >();
  return {
    ...actual,
    renameReusableSection: vi.fn(),
    listVersions: vi.fn(),
    rollbackToVersion: vi.fn(),
    saveDraft: vi.fn(),
  };
});

// The canvas mints a real preview token on mount: mocked, so nothing here
// calls the API.
vi.mock('../../lib/preview-token-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/preview-token-api-client')>();
  return { ...actual, createReusableSectionPreviewToken: vi.fn() };
});

const template = buildReusableSectionRecord({
  id: 'section-9',
  name: 'Scheda servizio',
  kind: 'template',
  status: 'draft',
});

function version(id: string, createdAt: string) {
  return {
    id,
    tenantId: 'tenant-1',
    reusableSectionId: 'section-9',
    content: [],
    createdBy: null,
    createdAt,
  };
}

function renderEditor(section = template) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    reusableSectionQueryOptions(section.id).queryKey,
    section,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <WithToasts>
        <ReusableSectionEditorView
          sectionId={section.id}
          siteId="site-1"
          locale="it"
        />
      </WithToasts>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('ReusableSectionEditorView', () => {
  beforeEach(() => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
    vi.mocked(
      previewTokenApi.createReusableSectionPreviewToken,
    ).mockResolvedValue({
      token: 'tok',
      expiresAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // The bar named nothing: not the section, not whether it was live.
  it('names the section in the bar and says whether it is published', () => {
    renderEditor();

    expect(
      screen.getByRole('heading', { name: 'Scheda servizio' }),
    ).toBeTruthy();
    expect(screen.getByText('Bozza')).toBeTruthy();
  });

  it('goes back to the list it came from, the templates if it is one', () => {
    renderEditor();

    const link = screen.getByRole('link', { name: /torna alle sezioni/i });
    expect(link.getAttribute('href')).toBe('/sections?kind=template');
    expect(link.className).toContain('whitespace-nowrap');
  });

  describe('renaming', () => {
    it('asks for the new name, starting from the current one, and says it was done', async () => {
      vi.mocked(sectionsApi.renameReusableSection).mockResolvedValue({
        ...template,
        name: 'Scheda prodotto',
      });
      renderEditor();

      fireEvent.click(screen.getByRole('button', { name: 'Rinomina' }));
      const field = screen.getByLabelText<HTMLInputElement>('Nome');
      expect(field.value).toBe('Scheda servizio');
      fireEvent.change(field, { target: { value: 'Scheda prodotto' } });
      fireEvent.click(
        screen
          .getAllByRole('button', { name: 'Rinomina' })
          .filter((button) => button.closest('[role="dialog"]'))[0],
      );

      await waitFor(() =>
        expect(sectionsApi.renameReusableSection).toHaveBeenCalledWith(
          'section-9',
          'Scheda prodotto',
        ),
      );
      expect(
        await screen.findByText('Nome cambiato in “Scheda prodotto”'),
      ).toBeTruthy();
      // The bar follows.
      expect(
        screen.getByRole('heading', { name: 'Scheda prodotto' }),
      ).toBeTruthy();
    });

    it('says the name is taken, in the dialog, and keeps what was typed', async () => {
      vi.mocked(sectionsApi.renameReusableSection).mockRejectedValue(
        new ApiError(409, { message: 'Conflict' }),
      );
      renderEditor();

      fireEvent.click(screen.getByRole('button', { name: 'Rinomina' }));
      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'Newsletter' },
      });
      fireEvent.click(
        screen
          .getAllByRole('button', { name: 'Rinomina' })
          .filter((button) => button.closest('[role="dialog"]'))[0],
      );

      expect(
        await screen.findByText('Esiste già una sezione con questo nome.'),
      ).toBeTruthy();
      expect(screen.getByLabelText<HTMLInputElement>('Nome').value).toBe(
        'Newsletter',
      );
    });
  });

  it('opens the version history, with its words on the button', async () => {
    vi.mocked(sectionsApi.listVersions).mockResolvedValue([
      version('v1', '2026-01-01T00:00:00.000Z'),
      version('v2', '2026-01-02T00:00:00.000Z'),
    ]);
    renderEditor();

    fireEvent.click(
      screen.getByRole('button', { name: /cronologia versioni/i }),
    );

    await waitFor(() =>
      expect(sectionsApi.listVersions).toHaveBeenCalledWith('section-9'),
    );
    expect(
      await screen.findAllByRole('button', { name: /^ripristina$/i }),
    ).toHaveLength(1);
  });
});
