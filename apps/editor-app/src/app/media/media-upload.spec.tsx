import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MediaDropZone,
  MediaUploadButton,
  MediaUploadProgress,
} from './media-upload';
import type { MediaUploads } from './use-media-uploads';

function fakeUploads(overrides: Partial<MediaUploads> = {}): MediaUploads {
  return {
    entries: [],
    isUploading: false,
    upload: vi.fn(() => Promise.resolve()),
    dismiss: vi.fn(),
    ...overrides,
  };
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

/** The element that takes the drop: the parent of whatever the test put inside it. */
function zone(): HTMLElement {
  const element = screen.getByText('the grid').parentElement;
  if (!element) throw new Error('the drop zone did not render');
  return element;
}

describe('MediaDropZone', () => {
  /*
   * Nothing is drawn on the page for somebody who is not dragging
   * anything; the zone announces itself when a file is over it.
   */
  it('says "Drop to upload" only while a file is over it', () => {
    render(
      <MediaDropZone uploads={fakeUploads()}>
        <p>the grid</p>
      </MediaDropZone>,
    );
    expect(screen.queryByText('Rilascia per caricare')).toBeNull();

    fireEvent.dragEnter(zone(), { dataTransfer: { types: ['Files'] } });

    expect(screen.getByText('Rilascia per caricare')).toBeTruthy();
    // The warning is said here, at the moment of dropping.
    expect(
      screen.getByText(/kometio non controlla cosa contiene/i),
    ).toBeTruthy();
    expect(zone().className).toContain('border-primary');
    expect(zone().className).toContain('border-dashed');
  });

  it('does not react to a drag that carries no file — a piece of text is not an upload', () => {
    render(
      <MediaDropZone uploads={fakeUploads()}>
        <p>the grid</p>
      </MediaDropZone>,
    );

    fireEvent.dragEnter(zone(), {
      dataTransfer: { types: ['text/plain'] },
    });

    expect(screen.queryByText('Rilascia per caricare')).toBeNull();
  });

  it('stays lit while the drag crosses what is inside it, and goes out when it leaves', () => {
    render(
      <MediaDropZone uploads={fakeUploads()}>
        <p>the grid</p>
      </MediaDropZone>,
    );
    const child = screen.getByText('the grid');
    const drag = { dataTransfer: { types: ['Files'] } };

    fireEvent.dragEnter(zone(), drag);
    // Into a child and out of the zone's own edge: the browser fires an
    // enter for the child before the leave for the zone.
    fireEvent.dragEnter(child, drag);
    fireEvent.dragLeave(zone(), drag);
    expect(screen.getByText('Rilascia per caricare')).toBeTruthy();

    fireEvent.dragLeave(child, drag);
    expect(screen.queryByText('Rilascia per caricare')).toBeNull();
  });

  it('uploads what is dropped, all of it', () => {
    const uploads = fakeUploads();
    render(
      <MediaDropZone uploads={uploads}>
        <p>the grid</p>
      </MediaDropZone>,
    );
    const files = [png('a.png'), png('b.png')];

    fireEvent.drop(zone(), {
      dataTransfer: { types: ['Files'], files },
    });

    expect(uploads.upload).toHaveBeenCalledWith(files);
    expect(screen.queryByText('Rilascia per caricare')).toBeNull();
  });
});

describe('MediaUploadProgress', () => {
  it('draws nothing until there is a batch', () => {
    const { container } = render(
      <MediaUploadProgress uploads={fakeUploads()} />,
    );

    expect(container.textContent).toBe('');
  });

  it('gives each file a line with what it is doing, and the reason where it failed', () => {
    render(
      <MediaUploadProgress
        uploads={fakeUploads({
          entries: [
            { id: 0, name: 'uno.png', status: 'done' },
            { id: 1, name: 'due.png', status: 'uploading' },
            { id: 2, name: 'tre.png', status: 'waiting' },
            {
              id: 3,
              name: 'quattro.exe',
              status: 'failed',
              error: 'Il file è troppo grande',
            },
          ],
          isUploading: true,
        })}
      />,
    );

    expect(screen.getByText('uno.png')).toBeTruthy();
    expect(screen.getByText('Caricato')).toBeTruthy();
    expect(screen.getByText('Caricamento…')).toBeTruthy();
    expect(screen.getByText('In attesa')).toBeTruthy();
    expect(
      screen.getByText('Non caricato: Il file è troppo grande'),
    ).toBeTruthy();
    // On its way: nothing to hide yet.
    expect(screen.queryByRole('button', { name: 'Nascondi' })).toBeNull();
  });

  it('can be hidden once the batch is over', () => {
    const uploads = fakeUploads({
      entries: [{ id: 0, name: 'uno.png', status: 'done' }],
    });
    render(<MediaUploadProgress uploads={uploads} />);

    fireEvent.click(screen.getByRole('button', { name: 'Nascondi' }));

    expect(uploads.dismiss).toHaveBeenCalled();
  });
});

describe('MediaUploadButton', () => {
  it('waits, and says so, while files are on their way', () => {
    render(<MediaUploadButton uploads={fakeUploads({ isUploading: true })} />);

    const button = screen.getByRole('button', {
      name: /caricamento in corso/i,
    });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('suggests the kind of file a folder holds, and nothing where the library takes anything', () => {
    const { container, rerender } = render(
      <MediaUploadButton uploads={fakeUploads()} kind="video" />,
    );
    expect(container.querySelector('input')?.getAttribute('accept')).toBe(
      'video/*',
    );

    rerender(<MediaUploadButton uploads={fakeUploads()} kind="document" />);
    expect(container.querySelector('input')?.getAttribute('accept')).toBeNull();
  });
});
