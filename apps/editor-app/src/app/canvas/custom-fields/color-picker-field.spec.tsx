import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../components/ui/tooltip';
import { ColorPickerField } from './color-picker-field';

describe('ColorPickerField', () => {
  it('renders the theme-default swatch and empty text input when value is null', () => {
    render(<ColorPickerField value={null} onChange={vi.fn()} />);

    const colorInput = document.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    expect(colorInput.value).toBe('#000000');
    expect(screen.getByPlaceholderText('Eredita dal tema')).toHaveProperty(
      'value',
      '',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reports the new value when the color swatch changes', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="#123456" onChange={onChange} />);

    const colorInput = document.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#abcdef' } });

    expect(onChange).toHaveBeenCalledWith('#abcdef');
  });

  it('reports a valid typed hex value', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value={null} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('Eredita dal tema'), {
      target: { value: '#ff00ff' },
    });

    expect(onChange).toHaveBeenCalledWith('#ff00ff');
  });

  it('ignores a malformed typed value instead of reporting it', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value={null} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('Eredita dal tema'), {
      target: { value: 'not-a-color' },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports null when the typed value is cleared to empty', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="#123456" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText('Eredita dal tema'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a clear button when a value is set, and it reports null when clicked', () => {
    const onChange = vi.fn();
    render(<ColorPickerField value="#123456" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows no clear button when value is undefined (a never-customized property, not the same as null)', () => {
    render(
      <ColorPickerField
        value={undefined as unknown as null}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the theme colour a field falls back to, rather than printing its CSS value', () => {
    render(
      <TooltipProvider>
        <ColorPickerField
          value={null}
          onChange={vi.fn()}
          defaultValue="oklch(0.205 0 0)"
          themeTokens={{
            primary: '#336699',
            secondary: '#eeeeee',
            fontSansValue: 'sans-serif',
            radius: '0.5rem',
            foreground: 'oklch(0.205 0 0)',
          }}
        />
      </TooltipProvider>,
    );

    // "Tema: oklch(0.205 0 0)" was the CSS, not the colour.
    expect(screen.getByTitle('Tema: Testo')).toBeTruthy();
    expect(screen.getByPlaceholderText('Tema: Testo')).toBeTruthy();
  });

  it("says only that it inherits when the fallback is not one of the theme's named colours", () => {
    render(
      <ColorPickerField
        value={null}
        onChange={vi.fn()}
        defaultValue="oklch(0.205 0 0)"
      />,
    );

    expect(screen.getByPlaceholderText('Eredita dal tema')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/oklch/)).toBeNull();
  });

  it('names the theme colour that is picked', () => {
    render(
      <TooltipProvider>
        <ColorPickerField
          value="var(--primary)"
          onChange={vi.fn()}
          themeTokens={{
            primary: '#336699',
            secondary: '#eeeeee',
            fontSansValue: 'sans-serif',
            radius: '0.5rem',
            foreground: '#111111',
          }}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('Colore del tema: Primario')).toBeTruthy();
  });

  /*
   * No label reached either input: the one beside them was a caption with
   * nothing attached, so a screen reader said "colour well" and "edit
   * text" and never whose colour it was (axe: label).
   */
  it('names both inputs after what the colour is for, and the clear button by what it does', () => {
    render(
      <ColorPickerField
        label="Colore del testo"
        value="#336699"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Colore del testo')).toHaveProperty(
      'type',
      'color',
    );
    expect(
      screen.getByRole('textbox', {
        name: 'Colore del testo come codice (esadecimale o colore del tema)',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Torna al colore del tema' }),
    ).toBeTruthy();
  });

  it('uses a hex default value directly as the color swatch value', () => {
    render(
      <ColorPickerField
        value={null}
        onChange={vi.fn()}
        defaultValue="#336699"
      />,
    );

    const colorInput = document.querySelector(
      'input[type="color"]',
    ) as HTMLInputElement;
    expect(colorInput.value).toBe('#336699');
  });

  it('does not show the theme-default preview once a real value is set', () => {
    render(
      <ColorPickerField
        value="#123456"
        onChange={vi.fn()}
        defaultValue="oklch(0.205 0 0)"
      />,
    );

    expect(
      screen.queryByTitle('Valore attuale del tema: oklch(0.205 0 0)'),
    ).toBeNull();
  });
});
