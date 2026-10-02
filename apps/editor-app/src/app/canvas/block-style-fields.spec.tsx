import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { chooseOption } from '../../test/select.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { BlockStyleFields } from './block-style-fields';

describe('BlockStyleFields', () => {
  it('renders only the fields listed in properties, in that order', () => {
    render(
      <BlockStyleFields
        blockType="Button"
        properties={['borderRadius', 'backgroundColor']}
        value={{}}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Raggio angoli')).toBeTruthy();
    expect(screen.getByText('Colore di sfondo')).toBeTruthy();
    expect(screen.queryByText('Padding orizzontale')).toBeNull();
    expect(screen.queryByText('Colore testo')).toBeNull();
  });

  it('calls onChange with the updated field, keeping the others untouched', () => {
    const onChange = vi.fn();
    render(
      <BlockStyleFields
        blockType="Button"
        properties={['borderRadius', 'paddingX']}
        value={{ paddingX: '1rem' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Raggio angoli'), {
      target: { value: '9999px' },
    });

    expect(onChange).toHaveBeenCalledWith({
      paddingX: '1rem',
      borderRadius: '9999px',
    });
  });

  it('clears a length field to null when emptied', () => {
    const onChange = vi.fn();
    render(
      <BlockStyleFields
        blockType="Button"
        properties={['borderRadius']}
        value={{ borderRadius: '6px' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Raggio angoli'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith({ borderRadius: null });
  });

  it('updates a color field via the text input inside ColorPickerField', () => {
    const onChange = vi.fn();
    render(
      <BlockStyleFields
        blockType="Button"
        properties={['backgroundColor']}
        value={{}}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Eredita dal tema'), {
      target: { value: '#ff0000' },
    });

    expect(onChange).toHaveBeenCalledWith({ backgroundColor: '#ff0000' });
  });

  it('shows the resolved theme default as the placeholder for a length field', () => {
    render(
      <BlockStyleFields
        blockType="Button"
        properties={['borderRadius']}
        value={{}}
        onChange={vi.fn()}
        defaults={{ borderRadius: '0.5rem' }}
      />,
    );

    expect(screen.getByPlaceholderText('0.5rem')).toBeTruthy();
  });

  it('passes the resolved theme default through to ColorPickerField as a preview', () => {
    render(
      <TooltipProvider>
        <BlockStyleFields
          blockType="Button"
          properties={['backgroundColor']}
          value={{}}
          onChange={vi.fn()}
          defaults={{ backgroundColor: 'oklch(0.205 0 0)' }}
          themeTokens={{
            primary: 'oklch(0.205 0 0)',
            secondary: '#eeeeee',
            fontSansValue: 'sans-serif',
            radius: '0.5rem',
          }}
        />
      </TooltipProvider>,
    );

    // By the theme's name for it, not by its CSS value.
    expect(screen.getByPlaceholderText('Tema: Primario')).toBeTruthy();
  });

  it('renders marginTop/marginBottom as plain length fields, same as paddingX/paddingY', () => {
    const onChange = vi.fn();
    render(
      <BlockStyleFields
        blockType="Button"
        properties={['marginTop', 'marginBottom']}
        value={{ marginBottom: '2rem' }}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText('Spazio sopra')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Spazio sotto')).toHaveProperty(
      'value',
      '2rem',
    );

    fireEvent.change(screen.getByLabelText('Spazio sopra'), {
      target: { value: '1rem' },
    });

    expect(onChange).toHaveBeenCalledWith({
      marginBottom: '2rem',
      marginTop: '1rem',
    });
  });
});

/**
 * A property core has never heard of (ADR-0047): the theme said which
 * control to draw, and its label was registered into i18next on arrival.
 * Without this the panel would list the property and render nothing —
 * the silent no-op this arc keeps designing against.
 */
describe('BlockStyleFields with a theme’s own style property', () => {
  const windowTint = {
    key: 'windowTint',
    control: 'color' as const,
    label: { en: 'Window chrome', it: 'Cornice della finestra' },
  };

  it('draws the control the theme declared', () => {
    const { container } = render(
      <BlockStyleFields
        blockType="Code"
        themeProperties={[windowTint]}
        properties={['windowTint']}
        value={{}}
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector('input[type="color"]')).not.toBeNull();
  });

  it('draws a text input for a length property, with the declared placeholder', () => {
    render(
      <BlockStyleFields
        blockType="Card"
        themeProperties={[
          {
            key: 'cardElevation',
            control: 'length',
            label: { en: 'Elevation', it: 'Elevazione' },
            placeholder: '4px',
          },
        ]}
        properties={['cardElevation']}
        value={{}}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('4px')).toBeTruthy();
  });

  it('writes the value under the theme’s own key', () => {
    const onChange = vi.fn();
    render(
      <BlockStyleFields
        blockType="Card"
        themeProperties={[
          {
            key: 'cardElevation',
            control: 'length',
            label: { en: 'Elevation', it: 'Elevazione' },
          },
        ]}
        properties={['cardElevation']}
        value={{}}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8px' } });

    expect(onChange).toHaveBeenCalledWith({ cardElevation: '8px' });
  });

  // Listed but undeclared: nothing to draw, and nothing pretending to.
  it('renders nothing for a property no theme declared', () => {
    const { container } = render(
      <BlockStyleFields
        blockType="Code"
        properties={['windowTint']}
        value={{}}
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector('input')).toBeNull();
  });

  it('sets a choice from its menu, and "theme value" clears it back to null', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BlockStyleFields
        blockType="Button"
        properties={['borderStyle']}
        value={{}}
        onChange={onChange}
      />,
    );

    chooseOption(screen.getByLabelText('Stile del bordo'), 'Tratteggiato');
    expect(onChange).toHaveBeenLastCalledWith({ borderStyle: 'dashed' });

    rerender(
      <BlockStyleFields
        blockType="Button"
        properties={['borderStyle']}
        value={{ borderStyle: 'dashed' }}
        onChange={onChange}
      />,
    );
    chooseOption(screen.getByLabelText('Stile del bordo'), 'Valore del tema');
    expect(onChange).toHaveBeenLastCalledWith({ borderStyle: null });
  });
});
