import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { MediaUsage } from '@kometio/api-contracts';
import { buildMediaRecord } from '@kometio/testing/records';
import * as api from '../../lib/media-api-client';
import { ApiError } from '../../lib/http-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { sessionAs } from '../../test/current-session.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import { MediaDetailSheet } from './media-detail-sheet';

// The usages list links to where the file is used, which needs a router.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
  };
});

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

vi.mock('../../lib/media-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/media-api-client')>();
  return {
    ...actual,
    deleteMedia: vi.fn(),
    getMedia: vi.fn(),
    getMediaUsages: vi.fn(),
    updateMedia: vi.fn(),
  };
});

const photo = buildMediaRecord({
  id: 'media-7',
  filename: 'listino.png',
  mimeType: 'image/webp',
  size: 2048,
  width: 800,
  height: 600,
  createdAt: '2026-09-12T10:00:00.000Z',
  url: 'http://localhost:3000/api/uploads/abc.webp',
});

/** The confirm button of the delete question: the last "Elimina" on screen, the one in the dialog over the panel. */
function clickConfirmDelete() {
  const button = screen.getAllByRole('button', { name: 'Elimina' }).at(-1);
  if (!button) throw new Error('no delete button on screen');
  fireEvent.click(button);
}

const unused: MediaUsage = { pages: [], sections: [], layout: [] };

function renderSheet(
  item: api.MediaRecord | null,
  onClose = vi.fn(),
  fileId = 'media-7',
): ReturnType<typeof render> & { onClose: typeof onClose } {
  const view = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <MediaDetailSheet
          siteId="site-1"
          fileId={fileId}
          item={item}
          onClose={onClose}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
  return { ...view, onClose };
}

describe('MediaDetailSheet', () => {
  beforeEach(() => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
    vi.mocked(api.getMediaUsages).mockResolvedValue(unused);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('says what the file is: its name, format, size, pixels and the day it went up', () => {
    renderSheet(photo);

    expect(screen.getByRole('heading', { name: 'listino.png' })).toBeTruthy();
    expect(screen.getByText('WEBP')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('800 × 600 px')).toBeTruthy();
    expect(screen.getByText('12 set 2026')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'listino.png' })).toBeTruthy();
  });

  // The address field selects its text as it takes focus, so the panel used
  // to open with a highlighted URL nobody had asked for.
  it('opens with the focus on the panel, not on the URL field', async () => {
    renderSheet(photo);

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('dialog')),
    );
  });

  it('leaves out the pixels of a file that has none', () => {
    renderSheet(
      buildMediaRecord({
        filename: 'offerta.pdf',
        mimeType: 'application/pdf',
        width: null,
        height: null,
      }),
    );

    expect(screen.queryByText('Dimensioni')).toBeNull();
    expect(screen.getByText('PDF')).toBeTruthy();
  });

  it('plays a video and an audio file where it is shown', () => {
    const { container, unmount } = renderSheet(
      buildMediaRecord({ filename: 'clip.mp4', mimeType: 'video/mp4' }),
    );
    expect(
      container.ownerDocument.querySelector('video[controls]'),
    ).toBeTruthy();
    unmount();

    renderSheet(
      buildMediaRecord({ filename: 'voce.mp3', mimeType: 'audio/mpeg' }),
    );
    expect(document.querySelector('audio[controls]')).toBeTruthy();
  });

  it('shows the public URL in a read-only field, and copies it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderSheet(photo);

    const field = screen.getByLabelText<HTMLInputElement>('URL pubblico');
    expect(field.value).toBe(photo.url);
    expect(field.readOnly).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Copia URL' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(photo.url));
    expect(await screen.findByText('URL copiato')).toBeTruthy();
  });

  /*
   * No clipboard off a secure origin, or the browser said no: the address
   * is left selected so the keys can finish what the button could not.
   */
  it('selects the URL and says so when the clipboard is not available', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error('no'))) },
    });
    renderSheet(photo);
    const field = screen.getByLabelText<HTMLInputElement>('URL pubblico');
    const select = vi.spyOn(field, 'select');

    fireEvent.click(screen.getByRole('button', { name: 'Copia URL' }));

    expect(
      await screen.findByText(/non è stato possibile copiare/i),
    ).toBeTruthy();
    expect(select).toHaveBeenCalled();
  });

  it('downloads the file from its own address, in a tab of its own', () => {
    renderSheet(photo);

    const link = screen.getByRole('link', { name: 'Scarica' });
    expect(link.getAttribute('href')).toBe(photo.url);
    expect(link.getAttribute('download')).toBe('listino.png');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('deletes the file only after the answer is yes, then says so and closes', async () => {
    vi.mocked(api.deleteMedia).mockResolvedValue(undefined);
    const { onClose } = renderSheet(photo);

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(screen.getByText(/verrà eliminato definitivamente/i)).toBeTruthy();
    expect(api.deleteMedia).not.toHaveBeenCalled();

    clickConfirmDelete();

    await waitFor(() =>
      expect(api.deleteMedia).toHaveBeenCalledWith('media-7'),
    );
    expect(await screen.findByText('“listino.png” eliminato')).toBeTruthy();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says why a file could not be deleted, and stays open', async () => {
    vi.mocked(api.deleteMedia).mockRejectedValue(
      new ApiError(500, { message: 'Storage is unavailable' }),
    );
    const { onClose } = renderSheet(photo);

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    clickConfirmDelete();

    expect(await screen.findByText('Storage is unavailable')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers no delete to a role that may not delete', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderSheet(photo);

    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull();
    // Everything else is still there.
    expect(screen.getByRole('link', { name: 'Scarica' })).toBeTruthy();
  });

  it('closes on Escape', () => {
    const { onClose } = renderSheet(photo);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  /*
   * The address can name a file the list on screen does not hold — a link
   * opened cold, a file on another page of the folder. It is asked for by
   * its id, and the panel opens on it.
   */
  it('opens a file the list does not hold by asking for it by its id', async () => {
    vi.mocked(api.getMedia).mockResolvedValue(photo);
    renderSheet(null);

    expect(
      await screen.findByRole('heading', { name: 'listino.png' }),
    ).toBeTruthy();
    expect(api.getMedia).toHaveBeenCalledWith('media-7');
    expect(screen.getByRole('button', { name: 'Copia URL' })).toBeTruthy();
  });

  it('does not ask for a file the list already holds', () => {
    renderSheet(photo);

    expect(api.getMedia).not.toHaveBeenCalled();
  });

  it('says the file is not there when the server has none by that id', async () => {
    vi.mocked(api.getMedia).mockRejectedValue(new ApiError(404, {}));
    renderSheet(null);

    expect(
      await screen.findByRole('heading', { name: 'File non trovato' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/non c’è: potrebbe essere stato eliminato/i),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copia URL' })).toBeNull();
  });

  // Deleting refreshes the list before the panel is told to close: for that
  // moment the address names a file the list no longer has, and the panel
  // must go on showing the file that has just gone, not "not found" — and
  // not ask the server for it either.
  it('keeps showing the file it had when the list stops holding it', () => {
    const view = renderSheet(photo);

    view.rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <WithToasts>
          <MediaDetailSheet
            siteId="site-1"
            fileId="media-7"
            item={null}
            onClose={vi.fn()}
          />
        </WithToasts>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'listino.png' })).toBeTruthy();
    expect(screen.queryByText('File non trovato')).toBeNull();
    expect(api.getMedia).not.toHaveBeenCalled();
  });

  describe('what a person writes about the file', () => {
    it('renames it and writes its alternative text, with a Save that appears once there is something to save', async () => {
      vi.mocked(api.updateMedia).mockResolvedValue({
        ...photo,
        filename: 'nuovo-nome.png',
        alt: 'Il listino',
      });
      renderSheet(photo);
      expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();

      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: '  nuovo-nome.png ' },
      });
      fireEvent.change(screen.getByLabelText('Testo alternativo'), {
        target: { value: 'Il listino' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(api.updateMedia).toHaveBeenCalledWith('media-7', {
          filename: 'nuovo-nome.png',
          alt: 'Il listino',
        }),
      );
      expect(await screen.findByText('File aggiornato')).toBeTruthy();
    });

    it('sends only what changed', async () => {
      vi.mocked(api.updateMedia).mockResolvedValue({
        ...photo,
        alt: 'Solo alt',
      });
      renderSheet(photo);

      fireEvent.change(screen.getByLabelText('Testo alternativo'), {
        target: { value: 'Solo alt' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      await waitFor(() =>
        expect(api.updateMedia).toHaveBeenCalledWith('media-7', {
          alt: 'Solo alt',
        }),
      );
    });

    it('asks for an alternative text only for a picture', () => {
      renderSheet(
        buildMediaRecord({
          filename: 'offerta.pdf',
          mimeType: 'application/pdf',
        }),
      );

      expect(screen.getByLabelText('Nome')).toBeTruthy();
      expect(screen.queryByLabelText('Testo alternativo')).toBeNull();
    });

    it('will not save an empty name, and says so', async () => {
      renderSheet(photo);

      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: '  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      expect(await screen.findByText('Scrivi il nome del file.')).toBeTruthy();
      expect(api.updateMedia).not.toHaveBeenCalled();
    });

    it("says the server's own sentence when it refuses, and keeps what was typed", async () => {
      vi.mocked(api.updateMedia).mockRejectedValue(
        new ApiError(400, {
          message: 'Invalid media filename: it contains a slash',
        }),
      );
      renderSheet(photo);

      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'a/b.png' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }));

      expect(
        await screen.findByText('Invalid media filename: it contains a slash'),
      ).toBeTruthy();
      expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(
        'a/b.png',
      );
    });

    it('puts the file back on Cancel', () => {
      renderSheet(photo);

      fireEvent.change(screen.getByLabelText('Nome'), {
        target: { value: 'altro' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

      expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(
        'listino.png',
      );
      expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
    });
  });

  describe('where it is used', () => {
    const used: MediaUsage = {
      pages: [{ pageGroupId: 'g1', title: 'Chi siamo', locales: ['en', 'it'] }],
      sections: [{ sectionId: 's1', name: 'Hero', kind: 'shared' }],
      layout: [{ kind: 'header', locale: 'it' }],
    };

    it('says it is used nowhere', async () => {
      renderSheet(photo);

      expect(
        await screen.findByText('Non è usato da nessuna parte.'),
      ).toBeTruthy();
    });

    it('lists the pages, sections and header that hold it, each a link', async () => {
      vi.mocked(api.getMediaUsages).mockResolvedValue(used);
      renderSheet(photo);

      const page = await screen.findByRole('link', { name: 'Chi siamo' });
      expect(page.getAttribute('href')).toBe('/page-groups/g1');
      expect(screen.getByText('Pagina · inglese, italiano')).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'Hero' }).getAttribute('href'),
      ).toBe('/sections/s1');
      expect(screen.getByText('Sezione condivisa')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Header' })).toBeTruthy();
    });

    it('says what deleting would leave empty, in the question', async () => {
      vi.mocked(api.getMediaUsages).mockResolvedValue(used);
      renderSheet(photo);
      await screen.findByRole('link', { name: 'Chi siamo' });

      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

      expect(screen.getByText(/è usato in 3 punti del sito/i)).toBeTruthy();
    });

    it('does not scare anybody about a file that is used nowhere', async () => {
      renderSheet(photo);
      await screen.findByText('Non è usato da nessuna parte.');

      fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

      expect(screen.queryByText(/è usato in/i)).toBeNull();
    });

    it('says when it could not check', async () => {
      vi.mocked(api.getMediaUsages).mockRejectedValue(new Error('boom'));
      renderSheet(photo);

      expect(
        await screen.findByText(
          'Non è stato possibile controllare dove è usato.',
        ),
      ).toBeTruthy();
    });
  });
});
