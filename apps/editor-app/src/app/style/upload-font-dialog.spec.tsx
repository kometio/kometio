import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMediaRecord } from '@kometio/testing/records';
import * as mediaApi from '../../lib/media-api-client';
import { TooltipProvider } from '../../components/ui/tooltip';
import { UploadFontDialog } from './upload-font-dialog';

vi.mock('../../lib/media-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/media-api-client')>()),
  uploadMedia: vi.fn(),
}));

function renderDialog() {
  const onUploaded = vi.fn();
  render(
    <TooltipProvider>
      <UploadFontDialog
        siteId="site-1"
        open
        onOpenChange={vi.fn()}
        onUploaded={onUploaded}
      />
    </TooltipProvider>,
  );
  return { onUploaded };
}

function chooseFiles(...names: string[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  fireEvent.change(input, {
    target: { files: names.map((name) => new File(['wOF2'], name)) },
  });
}

describe('UploadFontDialog', () => {
  afterEach(() => vi.mocked(mediaApi.uploadMedia).mockReset());

  it('uploads each file with the weight and style its name says, and hands the font over', async () => {
    vi.mocked(mediaApi.uploadMedia)
      .mockResolvedValueOnce(
        buildMediaRecord({
          id: '00000000-0000-4000-8000-000000000001',
          url: 'https://api.test/uploads/a.woff2',
        }),
      )
      .mockResolvedValueOnce(
        buildMediaRecord({
          id: '00000000-0000-4000-8000-000000000002',
          url: 'https://api.test/uploads/b.woff2',
        }),
      );
    const { onUploaded } = renderDialog();

    chooseFiles('Biscotto-Regular.woff2', 'Biscotto-BoldItalic.woff2');
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveProperty(
      'value',
      'Biscotto',
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Ho il diritto/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Carica' }));

    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({
        family: 'Biscotto',
        faces: [
          {
            mediaId: '00000000-0000-4000-8000-000000000001',
            url: 'https://api.test/uploads/a.woff2',
            weight: '400',
            style: 'normal',
          },
          {
            mediaId: '00000000-0000-4000-8000-000000000002',
            url: 'https://api.test/uploads/b.woff2',
            weight: '700',
            style: 'italic',
          },
        ],
      }),
    );
  });

  it('refuses a TrueType file by its name, before anything is uploaded', () => {
    renderDialog();

    chooseFiles('Biscotto.ttf');

    expect(
      screen.getByText('Biscotto.ttf non è un file WOFF2 o WOFF.'),
    ).toBeTruthy();
    expect(mediaApi.uploadMedia).not.toHaveBeenCalled();
  });

  it('uploads nothing until the box says the font may be used on a website', () => {
    renderDialog();

    chooseFiles('Biscotto-Regular.woff2');
    fireEvent.click(screen.getByRole('button', { name: 'Carica' }));

    expect(
      screen.getByText(
        'Spunta la casella: serve il diritto di usare questo font su un sito web.',
      ),
    ).toBeTruthy();
    expect(mediaApi.uploadMedia).not.toHaveBeenCalled();
  });

  it('refuses two files with the same weight and style', () => {
    renderDialog();

    chooseFiles('Biscotto-Regular.woff2', 'Biscotto-Book.woff2');
    fireEvent.click(screen.getByRole('checkbox', { name: /Ho il diritto/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Carica' }));

    expect(
      screen.getByText('Due file hanno lo stesso peso e lo stesso stile.'),
    ).toBeTruthy();
    expect(mediaApi.uploadMedia).not.toHaveBeenCalled();
  });

  it('says which file was not uploaded', async () => {
    vi.mocked(mediaApi.uploadMedia).mockRejectedValue(new Error('network'));
    const { onUploaded } = renderDialog();

    chooseFiles('Biscotto-Regular.woff2');
    fireEvent.click(screen.getByRole('checkbox', { name: /Ho il diritto/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Carica' }));

    expect(
      await screen.findByText('Biscotto-Regular.woff2 non è stato caricato.'),
    ).toBeTruthy();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
