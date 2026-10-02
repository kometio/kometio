import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BrandColorField,
  brandColor,
  type BrandColorFieldProps,
} from './brand-color-field';

function renderField(props: Partial<BrandColorFieldProps> = {}) {
  const onEnabledChange = vi.fn();
  const onValueChange = vi.fn();
  render(
    <BrandColorField
      id="test-color"
      kind="primary"
      enabled={false}
      onEnabledChange={onEnabledChange}
      value={null}
      onValueChange={onValueChange}
      themeValue={undefined}
      foreground={undefined}
      {...props}
    />,
  );
  return { onEnabledChange, onValueChange };
}

describe('brandColor', () => {
  it("is the site's own colour when it picked one", () => {
    expect(brandColor('primary', '#123456', '#5b9bd5')).toBe('#123456');
  });

  it("starts from the theme's colour, so turning the override on changes nothing yet", () => {
    expect(brandColor('primary', null, '#5b9bd5')).toBe('#5b9bd5');
  });

  it("opens on the theme's own colour when it writes it in oklch, as the classic theme does", () => {
    // Not the neutral grey: the picker starts from what the site shows.
    expect(brandColor('primary', null, 'oklch(0.5 0.2 260)')).toMatch(
      /^#[0-9a-f]{6}$/,
    );
    expect(brandColor('primary', null, 'oklch(0.5 0.2 260)')).not.toBe(
      '#18181b',
    );
  });

  it('starts from a neutral grey when the theme names no colour the picker can hold', () => {
    expect(brandColor('primary', null, 'banana')).toBe('#18181b');
    expect(brandColor('secondary', null, undefined)).toBe('#71717a');
  });
});

describe('BrandColorField', () => {
  it('hides the picker until the override is on', () => {
    renderField({ value: '#123456' });

    expect(screen.queryByText('#123456')).toBeNull();
  });

  it('shows the colour it will save when the override is on', () => {
    renderField({ enabled: true, themeValue: '#5b9bd5' });

    expect(screen.getByText('#5b9bd5')).toBeTruthy();
    expect(
      screen.getByLabelText('Colore primario', { selector: 'input' }),
    ).toHaveProperty('value', '#5b9bd5');
  });

  it('turns the override on from its switch, named after the colour', () => {
    const { onEnabledChange } = renderField();

    fireEvent.click(
      screen.getByRole('switch', { name: /colore primario.*personalizza/i }),
    );

    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it('reports a picked colour', () => {
    const { onValueChange } = renderField({ enabled: true });

    fireEvent.change(
      screen.getByLabelText('Colore primario', { selector: 'input' }),
      { target: { value: '#00ff00' } },
    );

    expect(onValueChange).toHaveBeenCalledWith('#00ff00');
  });

  it("says the theme's own value applies while the override is off", () => {
    renderField({ themeValue: '#5b9bd5' });

    expect(
      screen.getByText(
        'Valore di base del tema attivo — personalizzalo qui o modificando il tema stesso',
      ),
    ).toBeTruthy();
  });

  it("warns when the theme's text cannot be read on the colour", () => {
    renderField({ enabled: true, value: '#ffffff', foreground: '#ffffff' });

    expect(screen.getByText(/Contrasto basso/)).toBeTruthy();
  });
});
