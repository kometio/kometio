import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '../../../components/ui/tooltip';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { PickedMedia } from '@kometio/shared-types';
import {
  MediaPickerContext,
  type MediaPickerPort,
} from '../../media/media-picker-context';
import {
  GalleryPickerField,
  type GalleryImageItem,
} from './gallery-picker-field';

const media: PickedMedia = { mediaId: 'm1', url: '/m1.jpg' };

function wrapperWith(port: MediaPickerPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TooltipProvider>
        <MediaPickerContext.Provider value={port}>
          {children}
        </MediaPickerContext.Provider>
      </TooltipProvider>
    );
  };
}

describe('GalleryPickerField', () => {
  it('renders one slot per item, plus an "Aggiungi immagine" button, with no preview image for an empty slot', () => {
    const value: GalleryImageItem[] = [
      { media: null, alt: '', isDecorative: false },
    ];
    render(<GalleryPickerField value={value} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Scegli immagine')).toBeTruthy();
    expect(screen.getByText('Aggiungi immagine')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('appends an empty slot when "Aggiungi immagine" is clicked', () => {
    const onChange = vi.fn();
    render(<GalleryPickerField value={[]} onChange={onChange} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    fireEvent.click(screen.getByText('Aggiungi immagine'));

    // `caption` since ADR-0057 — a new slot carries the empty string
    // rather than nothing, so the field is controlled from the start.
    expect(onChange).toHaveBeenCalledWith([
      { media: null, alt: '', isDecorative: false, caption: '' },
    ]);
  });

  it('removes only the targeted slot when its "Rimuovi" is clicked', () => {
    const onChange = vi.fn();
    const value: GalleryImageItem[] = [
      { media, alt: 'Prima', isDecorative: false },
      { media: null, alt: 'Seconda', isDecorative: false },
    ];
    render(<GalleryPickerField value={value} onChange={onChange} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    fireEvent.click(screen.getAllByText('Rimuovi')[0]);

    // A picture saved before captions existed comes back with an empty
    // one: the gallery's own schema fills it in, as the site does.
    expect(onChange).toHaveBeenCalledWith([
      { media: null, alt: 'Seconda', isDecorative: false, caption: '' },
    ]);
  });

  it('updates only the alt text of the edited slot', () => {
    const onChange = vi.fn();
    const value: GalleryImageItem[] = [
      { media: null, alt: 'Vecchio', isDecorative: false },
      { media: null, alt: 'Altro', isDecorative: false },
    ];
    render(<GalleryPickerField value={value} onChange={onChange} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    fireEvent.change(screen.getAllByLabelText('Testo alternativo')[0], {
      target: { value: 'Nuovo' },
    });

    expect(onChange).toHaveBeenCalledWith([
      { media: null, alt: 'Nuovo', isDecorative: false, caption: '' },
      { media: null, alt: 'Altro', isDecorative: false, caption: '' },
    ]);
  });

  it('sets the media of the targeted slot when the picker resolves one', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(media);
    const value: GalleryImageItem[] = [
      { media: null, alt: '', isDecorative: false },
    ];
    render(<GalleryPickerField value={value} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli immagine'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledWith([
      { media, alt: '', isDecorative: false, caption: '' },
    ]);
  });

  it('shows the preview image and "Cambia immagine" once a slot has media', () => {
    const value: GalleryImageItem[] = [{ media, alt: '', isDecorative: false }];
    render(<GalleryPickerField value={value} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Cambia immagine')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/m1.jpg');
  });

  it('warns when alt is empty and the item is not marked decorative', () => {
    const value: GalleryImageItem[] = [{ media, alt: '', isDecorative: false }];
    render(<GalleryPickerField value={value} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(
      screen.getByText('Testo alternativo richiesto (o segna come decorativa)'),
    ).toBeTruthy();
  });

  it('does not warn once the item is marked decorative, and disables its alt input', () => {
    const onChange = vi.fn();
    const value: GalleryImageItem[] = [{ media, alt: '', isDecorative: false }];
    render(<GalleryPickerField value={value} onChange={onChange} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith([
      { media, alt: '', isDecorative: true, caption: '' },
    ]);
  });

  it('does not warn when alt already has a value', () => {
    const value: GalleryImageItem[] = [
      { media, alt: 'Un gatto', isDecorative: false },
    ];
    render(<GalleryPickerField value={value} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(
      screen.queryByText(
        'Testo alternativo richiesto (o segna come decorativa)',
      ),
    ).toBeNull();
  });

  it('does not warn while the file has a text of its own to say — the picture says that one', () => {
    const value: GalleryImageItem[] = [
      { media: { ...media, alt: 'Una moka' }, alt: '', isDecorative: false },
    ];
    render(<GalleryPickerField value={value} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(
      screen.queryByText(
        'Testo alternativo richiesto (o segna come decorativa)',
      ),
    ).toBeNull();
  });

  it('still warns when the file has none recorded, or only spaces', () => {
    for (const alt of [undefined, '', '   ']) {
      const value: GalleryImageItem[] = [
        { media: { ...media, alt }, alt: '', isDecorative: false },
      ];
      const { unmount } = render(
        <GalleryPickerField value={value} onChange={vi.fn()} />,
        { wrapper: wrapperWith({ pick: vi.fn() }) },
      );

      expect(
        screen.getByText(
          'Testo alternativo richiesto (o segna come decorativa)',
        ),
      ).toBeTruthy();
      unmount();
    }
  });

  it('moves a picture without losing the others, which was impossible before', () => {
    // The only way to reorder a gallery used to be deleting every image
    // after the one you wanted to move and adding them all back.
    const onChange = vi.fn();
    const items = [
      { media: null, alt: 'first', isDecorative: false, caption: '' },
      { media: null, alt: 'second', isDecorative: false, caption: '' },
    ];
    render(<GalleryPickerField value={items} onChange={onChange} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    fireEvent.click(screen.getAllByLabelText('Sposta su')[1]);

    expect(onChange).toHaveBeenCalledWith([items[1], items[0]]);
  });

  it('cannot move the first picture up or the last one down', () => {
    const onChange = vi.fn();
    const items = [
      { media: null, alt: 'first', isDecorative: false, caption: '' },
      { media: null, alt: 'second', isDecorative: false, caption: '' },
    ];
    render(<GalleryPickerField value={items} onChange={onChange} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    // Disabled rather than a no-op handler: a control that looks
    // available and does nothing is worse than one that says it cannot.
    expect(
      screen.getAllByLabelText('Sposta su')[0].hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getAllByLabelText('Sposta giù')[1].hasAttribute('disabled'),
    ).toBe(true);
  });

  /*
   * The inspector hands the field the raw prop. A gallery saved before its
   * `images` key existed has none at all, and the field read `.map` of
   * undefined; something it cannot read must not look empty either, or
   * the first edit would overwrite pictures nobody saw.
   */
  it('shows an empty gallery for a block with no images key at all', () => {
    render(<GalleryPickerField value={undefined} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Aggiungi immagine')).toBeTruthy();
  });

  it('refuses to edit images it cannot read, rather than showing none', () => {
    const onChange = vi.fn();
    render(
      <GalleryPickerField value={[{ src: '/old.jpg' }]} onChange={onChange} />,
      { wrapper: wrapperWith({ pick: vi.fn() }) },
    );

    expect(screen.getByRole('alert').textContent).toContain(
      "l'editor non sa leggere",
    );
    expect(screen.queryByText('Aggiungi immagine')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
