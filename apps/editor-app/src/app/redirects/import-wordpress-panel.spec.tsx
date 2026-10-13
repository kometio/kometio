import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import * as importsApi from '../../lib/imports-api-client';
import * as api from '../../lib/redirects-api-client';
import type { WordPressRedirectPlan } from '../../lib/redirects-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ImportRedirectsDialog } from './import-redirects-dialog';
import { leftOutAsCsv } from './import-wordpress-panel';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
}));

vi.mock('../../lib/imports-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/imports-api-client')>()),
  listImportJobs: vi.fn(),
}));

vi.mock('../../lib/redirects-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/redirects-api-client')>()),
  redirectsFromWordPress: vi.fn(),
}));

const analysed = {
  id: 'job-1',
  siteId: 'site-1',
  source: 'wordpress',
  fileName: 'old-site.xml',
  fileBytes: 1000,
  status: 'analyzed' as const,
  report: null,
  failureReason: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  finishedAt: '2026-10-01T10:00:05.000Z',
};

function plan(
  overrides: Partial<WordPressRedirectPlan> = {},
): WordPressRedirectPlan {
  return {
    report: {
      rows: [],
      created: 4,
      updated: 0,
      unchanged: 0,
      failed: 0,
      truncated: false,
      applied: false,
    },
    pages: { matched: 2, ambiguous: 0, unmatched: 1 },
    unmatched: [
      {
        id: 9,
        type: 'post',
        slug: 'not-made-yet',
        title: 'Not, made, "yet"',
        link: 'https://old.example/2019/06/not-made-yet/',
        parentId: null,
      },
    ],
    ambiguous: [],
    ...overrides,
  };
}

function renderDialog() {
  const onApplied = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ImportRedirectsDialog
        siteId="site-1"
        withWordPress
        onOpenChange={onOpenChange}
        onCheck={vi.fn()}
        onApply={vi.fn()}
        onApplied={onApplied}
      />
    </QueryClientProvider>,
  );
  return { onApplied, onOpenChange };
}

const openWordPress = async () =>
  fireEvent.click(
    await screen.findByRole('tab', { name: 'Da un’esportazione di WordPress' }),
  );

describe('the WordPress source of the import', () => {
  beforeEach(() => {
    vi.mocked(importsApi.listImportJobs).mockResolvedValue({
      items: [analysed],
    });
    // jsdom has no address for a file made in the tab.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:left-out');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('is offered next to the list only where an export may be read', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ImportRedirectsDialog
          siteId="site-1"
          withWordPress={false}
          onOpenChange={vi.fn()}
          onCheck={vi.fn()}
          onApply={vi.fn()}
          onApplied={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByLabelText('Oppure incolla qui l’elenco'),
    ).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('says what to do first when no export has been read', async () => {
    vi.mocked(importsApi.listImportJobs).mockResolvedValue({
      items: [{ ...analysed, status: 'failed' }],
    });
    renderDialog();

    await openWordPress();

    expect(
      await screen.findByText('Nessuna esportazione è stata ancora letta'),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Vai a Importa' }).getAttribute('href'),
    ).toBe('/imports');
  });

  it('puts the file’s pages beside the site’s before anything is written, and names what has no page', async () => {
    vi.mocked(api.redirectsFromWordPress).mockResolvedValue(plan());
    renderDialog();
    await openWordPress();

    const button = await screen.findByRole('button', {
      name: 'Controlla l’esportazione',
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(
      await screen.findByText(
        '2 pagine e articoli su 3 hanno già una pagina in questo sito.',
      ),
    ).toBeTruthy();
    expect(api.redirectsFromWordPress).toHaveBeenCalledWith({
      siteId: 'site-1',
      importJobId: 'job-1',
      dryRun: true,
    });
    expect(screen.getByText('4 nuovi')).toBeTruthy();
    expect(screen.getByText('Ancora senza pagina qui (1)')).toBeTruthy();
    expect(
      screen.getByText('https://old.example/2019/06/not-made-yet/'),
    ).toBeTruthy();

    // The list of what has no page is a file to work from, made in the tab.
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    fireEvent.click(
      screen.getByRole('button', { name: /Scarica questo elenco/ }),
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:left-out');
  });

  it('makes the redirects when asked, tells what was made, and closes', async () => {
    vi.mocked(api.redirectsFromWordPress)
      .mockResolvedValueOnce(plan())
      .mockResolvedValueOnce(
        plan({ report: { ...plan().report, applied: true } }),
      );
    const { onApplied, onOpenChange } = renderDialog();
    await openWordPress();
    const button = await screen.findByRole('button', {
      name: 'Controlla l’esportazione',
    });
    await act(async () => {
      fireEvent.click(button);
    });

    const apply = await screen.findByRole('button', {
      name: 'Importa 4 reindirizzamenti',
    });
    await act(async () => {
      fireEvent.click(apply);
    });

    await waitFor(() =>
      expect(api.redirectsFromWordPress).toHaveBeenLastCalledWith({
        siteId: 'site-1',
        importJobId: 'job-1',
        dryRun: false,
      }),
    );
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({ applied: true }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says a file read before addresses were kept has to be uploaded again, in words', async () => {
    vi.mocked(api.redirectsFromWordPress).mockRejectedValue(
      new ApiError(409, { message: 'import:no-permalinks:job-1' }),
    );
    renderDialog();
    await openWordPress();

    const button = await screen.findByRole('button', {
      name: 'Controlla l’esportazione',
    });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(
      await screen.findByText(
        /letto prima che gli indirizzi venissero conservati/,
      ),
    ).toBeTruthy();
  });
});

describe('leftOutAsCsv', () => {
  const labels = {
    type: 'Type',
    title: 'Title',
    address: 'Address',
    note: 'Note',
  };
  const notes = { unmatched: 'No page', ambiguous: 'Several' };

  it('is a header and a line each, with a title’s comma and quote one cell', () => {
    const csv = leftOutAsCsv(
      [
        {
          id: 1,
          type: 'post',
          slug: 'a',
          title: 'Say "hi", world',
          link: 'https://old.example/a/',
          parentId: null,
        },
      ],
      [
        {
          id: 2,
          type: 'page',
          slug: 'b',
          title: 'B',
          link: 'https://old.example/b/',
          parentId: null,
        },
      ],
      labels,
      notes,
    );

    expect(csv).toBe(
      [
        '"Type","Title","Address","Note"',
        '"post","Say ""hi"", world","https://old.example/a/","No page"',
        '"page","B","https://old.example/b/","Several"',
        '',
      ].join('\n'),
    );
  });
});
