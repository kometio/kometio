import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaPickerContext } from '../media/media-picker-context';
import { FaviconField } from './favicon-field';

function renderField(value: string, picked: { url: string } | null = null) {
  const onChange = vi.fn();
  const pick = vi.fn().mockResolvedValue(picked);
  render(
    <MediaPickerContext.Provider value={{ pick }}>
      <FaviconField value={value} onChange={onChange} />
    </MediaPickerContext.Provider>,
  );
  return { onChange, pick };
}

describe('FaviconField', () => {
  it('says there is no icon, and offers to choose one from the library — of pictures', async () => {
    const { pick, onChange } = renderField('', { url: 'http://x/icon.png' });

    expect(screen.getByText(/nessuna icona/i)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Scegli dalla libreria' }),
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith('http://x/icon.png'),
    );
    expect(pick).toHaveBeenCalledWith({ kind: 'image' });
  });

  it('shows the icon at the size a tab draws it, and offers to change or remove it', () => {
    const { onChange } = renderField('http://x/icon.png');

    const image = screen.getByAltText('Anteprima dell’icona');
    expect(image.getAttribute('src')).toBe('http://x/icon.png');
    expect(image.className).toContain('size-8');
    expect(screen.getByRole('button', { name: 'Cambia' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('changes nothing when the library is closed without choosing', async () => {
    const { pick, onChange } = renderField('http://x/icon.png', null);

    fireEvent.click(screen.getByRole('button', { name: 'Cambia' }));

    await waitFor(() => expect(pick).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });
});
