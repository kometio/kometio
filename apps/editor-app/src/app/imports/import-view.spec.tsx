import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { WordPressAnalysis } from '@kometio/shared-types';
import * as api from '../../lib/imports-api-client';
import type { ImportJobRecord } from '../../lib/imports-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ImportView } from './import-view';

vi.mock('../../lib/imports-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/imports-api-client')>();
  return {
    ...actual,
    startWordPressAnalysis: vi.fn(),
    getImportJob: vi.fn(),
    listImportJobs: vi.fn(),
  };
});

const REPORT: WordPressAnalysis = {
  siteTitle: 'Il Sito',
  sourceUrl: 'https://esempio.test',
  found: {
    pages: 21,
    posts: 7,
    attachments: 499,
    menuItems: 38,
    otherTypes: [{ type: 'acme_prodotto', count: 88 }],
  },
  pages: { whole: 6, partial: 8, empty: 14 },
  blocks: {
    total: 92,
    native: 34,
    fromFields: 46,
    fromFieldsByBlock: [
      { name: 'acf/banda-con-immagine', count: 34, knownFrom: 'definitions' },
      { name: 'acf/quote', count: 12, knownFrom: 'values' },
    ],
    dropped: 0,
    quarantined: [{ name: 'core/shortcode', count: 2 }],
  },
  terms: [{ taxonomy: 'category', count: 7 }],
  warnings: [
    { kind: 'multilingual', count: 1, detail: ['WPML'] },
    {
      kind: 'unsupported-post-types',
      count: 117,
      detail: ['acme_prodotto (88)'],
    },
  ],
};

function job(overrides: Partial<ImportJobRecord> = {}): ImportJobRecord {
  return {
    id: 'job-1',
    siteId: 'site-1',
    source: 'wordpress',
    fileName: 'export-wordpress.xml',
    fileBytes: 6_500_000,
    status: 'analyzed',
    report: REPORT,
    failureReason: null,
    createdAt: '2026-09-24T20:00:00.000Z',
    finishedAt: '2026-09-24T20:00:04.000Z',
    ...overrides,
  };
}

function renderView(items: ImportJobRecord[] = []) {
  vi.mocked(api.listImportJobs).mockResolvedValue({ items });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ImportView siteId="site-1" />
    </QueryClientProvider>,
  );
}

describe('ImportView', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('says plainly that it reads and does not import', async () => {
    // The whole premise of the screen, and the thing somebody must not
    // have to guess at before uploading their site.
    renderView();

    expect(
      await screen.findByText(/non scrive niente|writes nothing/i),
    ).toBeTruthy();
  });

  it('shows the newest attempt without being asked', async () => {
    renderView([job()]);

    expect(await screen.findByText('export-wordpress.xml')).toBeTruthy();
  });

  it('gives several numbers rather than one', async () => {
    // One figure would lie: a site can convert most of its blocks while
    // leaving most of its content outside, and the other way round.
    renderView([job()]);

    expect(await screen.findByText('6')).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
    // Native and field-backed counted together: both arrive with their
    // content, and the difference between them is how closely the layout
    // follows.
    expect(screen.getByText(/80 blocchi su 92|80 of 92 blocks/)).toBeTruthy();
    expect(screen.getByText(/46 letti dai campi|46 read from/)).toBeTruthy();
  });

  it('names the blocks that came through their own fields', async () => {
    renderView([job()]);

    expect(await screen.findByText(/acf\/banda-con-immagine/)).toBeTruthy();
  });

  it('marks the ones it could only read from their values', async () => {
    // A block whose shape the export describes and one read from its
    // values alone both arrive, but the second is less sure about what
    // each piece of it is — worth saying rather than averaging away.
    renderView([job()]);

    expect(
      await screen.findByText(/dai soli valori|from its values alone/),
    ).toBeTruthy();
  });

  it('names the blocks that would land in quarantine', async () => {
    renderView([job()]);

    expect(await screen.findByText('core/shortcode')).toBeTruthy();
  });

  it('spells out each warning in words, not as a code', async () => {
    renderView([job()]);

    expect(
      await screen.findByText(/Sito multilingua|Multilingual site/),
    ).toBeTruthy();
    expect(screen.getByText(/117 voci|117 entries/)).toBeTruthy();
  });

  it('says it is still reading while the job runs', async () => {
    renderView([job({ status: 'analyzing', report: null })]);

    expect(
      await screen.findByText(/Sto leggendo|Reading the file/),
    ).toBeTruthy();
  });

  it('shows the reason a job failed, from the job itself', async () => {
    // It failed after the request that started it had already answered,
    // so this row is the only place the person can be told.
    renderView([
      job({
        status: 'failed',
        report: null,
        failureReason: 'The server restarted while this file was being read.',
      }),
    ]);

    expect(
      await screen.findByText(
        'The server restarted while this file was being read.',
      ),
    ).toBeTruthy();
  });

  it('uploads the chosen file and starts watching the job it gets back', async () => {
    vi.mocked(api.startWordPressAnalysis).mockResolvedValue(
      job({ id: 'job-2', status: 'analyzing', report: null }),
    );
    vi.mocked(api.getImportJob).mockResolvedValue(job({ id: 'job-2' }));
    renderView();

    const input = document.querySelector('input[type="file"]');
    const file = new File(['<rss/>'], 'export.xml', { type: 'text/xml' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() =>
      expect(api.startWordPressAnalysis).toHaveBeenCalledWith('site-1', file),
    );
    await waitFor(() => expect(api.getImportJob).toHaveBeenCalledWith('job-2'));
  });

  it('offers the earlier attempts without burying the newest', async () => {
    renderView([job(), job({ id: 'job-0', fileName: 'primo-tentativo.xml' })]);

    expect(await screen.findByText('export-wordpress.xml')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /primo-tentativo\.xml/ }),
    ).toBeTruthy();
  });
});
