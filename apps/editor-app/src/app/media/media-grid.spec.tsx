import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '../../components/ui/tooltip';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildMediaRecord } from '@kometio/testing/records';
import { MediaGrid } from './media-grid';
import type { MediaUploads } from './use-media-uploads';

const mediaOne = buildMediaRecord();

function fakeUploads(overrides: Partial<MediaUploads> = {}): MediaUploads {
  return {
    entries: [],
    isUploading: false,
    upload: vi.fn(() => Promise.resolve()),
    dismiss: vi.fn(),
    ...overrides,
  };
}

function renderGrid(props: Partial<ComponentProps<typeof MediaGrid>> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <MediaGrid
          items={[mediaOne]}
          page={1}
          total={1}
          onPageChange={vi.fn()}
          filters={{}}
          onFiltersChange={vi.fn()}
          onSelect={vi.fn()}
          uploads={fakeUploads()}
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('MediaGrid', () => {
  /*
   * The grid was thumbnails and nothing else: no name, no kind, no size,
   * no date. With nineteen files it was already a wall of dark rectangles
   * — every screenshot in the docs is a black image — and the only way to
   * find one was to recognise it by sight.
   */
  it('names every file, with its format and size', () => {
    renderGrid();

    expect(screen.getByText('foto.png')).toBeTruthy();
    expect(screen.getByText(/WEBP/)).toBeTruthy();
    expect(screen.getByText(/1\.2 KB/)).toBeTruthy();
  });

  /*
   * The library takes any file now (ADR-0070). Two things have to be true
   * of one that is not a picture: it is not drawn as a broken image, and
   * it is labelled by the format a person recognises, not by a MIME type.
   */
  it('draws a document as a document, labelled by its own extension', () => {
    renderGrid({
      items: [
        {
          ...mediaOne,
          id: 'doc-1',
          filename: 'offerta.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      ],
    });

    expect(screen.queryByRole('img', { name: 'offerta.docx' })).toBeNull();
    expect(screen.getByText(/DOCX/)).toBeTruthy();
  });

  /*
   * A paragraph above every folder that nobody read is gone; the warning
   * shows up when somebody is actually uploading — with the files' progress.
   */
  it('does not carry the security warning on the page, only while uploading', () => {
    renderGrid();
    expect(
      screen.queryByText(/kometio non controlla cosa contiene/i),
    ).toBeNull();

    renderGrid({
      uploads: fakeUploads({
        entries: [{ id: 0, name: 'a.png', status: 'uploading' }],
        isUploading: true,
      }),
    });
    expect(
      screen.getByText(/kometio non controlla cosa contiene/i),
    ).toBeTruthy();
  });

  it('offers no choice of kind when the field has already made it', () => {
    renderGrid({ lockedKind: 'video' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('asks the caller for a new search rather than filtering the page it was given', () => {
    const onFiltersChange = vi.fn();
    renderGrid({ onFiltersChange });

    fireEvent.change(
      screen.getByRole('searchbox', { name: /cerca per nome/i }),
      {
        target: { value: 'foto' },
      },
    );

    // The server answers it: the library is paginated, so filtering what
    // came back would search the newest page and stay silent about the rest.
    expect(onFiltersChange).toHaveBeenCalledWith({ search: 'foto' });
  });

  it('narrows to one kind of file', () => {
    const onFiltersChange = vi.fn();
    renderGrid({ onFiltersChange });

    fireEvent.click(screen.getByRole('radio', { name: 'Video' }));

    expect(onFiltersChange).toHaveBeenCalledWith({ kind: 'video' });
  });

  it('says "nothing matches" rather than "no files yet" when a filter is on', () => {
    renderGrid({ items: [], total: 0, filters: { search: 'zzz' } });

    // "No files yet" would send somebody off to upload what they already
    // have.
    expect(screen.getByText(/nessun file corrisponde/i)).toBeTruthy();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no items', () => {
    renderGrid({ items: [], total: 0 });

    expect(screen.getByText(/la libreria è ancora vuota/i)).toBeTruthy();
  });

  /*
   * An empty folder used to answer "no files match", which sends somebody
   * looking for a filter to clear. It says what the folder holds, and
   * offers the way to put something in it.
   */
  it('says an empty folder is empty, by what it holds, and offers to upload into it', () => {
    renderGrid({
      items: [],
      total: 0,
      filters: { kind: 'video' },
      lockedKind: 'video',
    });

    expect(screen.getByText('Ancora nessun video.')).toBeTruthy();
    expect(screen.queryByText(/nessun file corrisponde/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Carica file' })).toBeTruthy();
  });

  it('renders a thumbnail for every item', () => {
    const { container } = renderGrid();

    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('uploads every file picked, not only the first', () => {
    const uploads = fakeUploads();
    const { container } = renderGrid({ items: [], total: 0, uploads });

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no file input');
    expect(input.multiple).toBe(true);
    const files = [
      new File(['a'], 'uno.png', { type: 'image/png' }),
      new File(['b'], 'due.png', { type: 'image/png' }),
    ];
    fireEvent.change(input, { target: { files } });

    expect(uploads.upload).toHaveBeenCalledWith(files);
  });

  it('calls onSelect when a thumbnail is clicked in picker mode', () => {
    const onSelect = vi.fn();
    renderGrid({ onSelect });

    fireEvent.click(screen.getByRole('button', { name: 'foto.png' }));

    expect(onSelect).toHaveBeenCalledWith(mediaOne);
  });

  /*
   * A file is a button on the library page too: clicking it opens its
   * panel. Nothing on the card is reachable only by hovering it — the
   * delete icon that used to appear on hover is in that panel now.
   */
  it('makes every file a button, and has nothing that appears only on hover', () => {
    renderGrid();

    expect(screen.getByRole('button', { name: 'foto.png' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /elimina/i })).toBeNull();
  });

  it('has no pagination controls when everything fits on one page', () => {
    renderGrid({ total: 1 });

    expect(screen.queryByText(/pagina 1 di/i)).toBeNull();
  });

  it('navigates to the next/previous page', () => {
    const onPageChange = vi.fn();
    renderGrid({ page: 2, total: 100, onPageChange });

    expect(screen.getByText(/pagina 2 di/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /pagina successiva/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: /pagina precedente/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
