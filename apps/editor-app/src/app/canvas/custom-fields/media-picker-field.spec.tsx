import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { PickedMedia } from '@kometio/shared-types';
import {
  MediaPickerContext,
  type MediaPickerPort,
} from '../../media/media-picker-context';
import { MediaPickerField } from './media-picker-field';

const media: PickedMedia = { mediaId: 'm1', url: '/m1.jpg' };

function wrapperWith(port: MediaPickerPort) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MediaPickerContext.Provider value={port}>
        {children}
      </MediaPickerContext.Provider>
    );
  };
}

describe('MediaPickerField', () => {
  it('shows "Scegli immagine" and no preview when value is null', () => {
    render(<MediaPickerField value={null} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Scegli immagine')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the preview image and "Cambia immagine" when a value is set', () => {
    render(<MediaPickerField value={media} onChange={vi.fn()} />, {
      wrapper: wrapperWith({ pick: vi.fn() }),
    });

    expect(screen.getByText('Cambia immagine')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/m1.jpg');
  });

  it('calls onChange with the picked media when the port resolves one', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(media);
    render(<MediaPickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli immagine'));
    await Promise.resolve();
    await Promise.resolve();

    expect(pick).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(media);
  });

  it('does not call onChange when the picker is dismissed without a selection', async () => {
    const onChange = vi.fn();
    const pick = vi.fn().mockResolvedValue(null);
    render(<MediaPickerField value={null} onChange={onChange} />, {
      wrapper: wrapperWith({ pick }),
    });

    fireEvent.click(screen.getByText('Scegli immagine'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onChange).not.toHaveBeenCalled();
  });
});
