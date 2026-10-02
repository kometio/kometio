import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Moon, Sun } from 'lucide-react';
import { ChoiceGroup } from './choice-group';
import { TooltipProvider } from './tooltip';

type Theme = 'light' | 'dark';

describe('ChoiceGroup', () => {
  it('is one radio group, named, with the current choice checked', () => {
    render(
      <ChoiceGroup
        label="Tipo di file"
        value="video"
        onValueChange={vi.fn()}
        choices={[
          { value: 'image', label: 'Immagini' },
          { value: 'video', label: 'Video' },
        ]}
      />,
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Tipo di file' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Video' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen
        .getByRole('radio', { name: 'Immagini' })
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('hands back the choice with its own type', () => {
    const onValueChange = vi.fn<(value: Theme) => void>();
    render(
      <TooltipProvider>
        <ChoiceGroup<Theme>
          label="Tema"
          value="light"
          onValueChange={onValueChange}
          choices={[
            { value: 'light', label: 'Chiaro', icon: <Sun /> },
            { value: 'dark', label: 'Scuro', icon: <Moon /> },
          ]}
        />
      </TooltipProvider>,
    );

    // The tooltip's own `data-state` lands on the same button, so the
    // current choice is drawn from `aria-checked`, which it cannot touch.
    const current = screen.getByRole('radio', { name: 'Chiaro' });
    expect(current.getAttribute('aria-checked')).toBe('true');
    expect(current.getAttribute('data-state')).not.toBe('checked');
    expect(current.className).toContain('aria-checked:bg-muted');

    // A picture is named by its label, which is what a reader hears.
    fireEvent.click(screen.getByRole('radio', { name: 'Scuro' }));

    expect(onValueChange).toHaveBeenCalledWith('dark');
  });

  it('checks nothing when the value is none of its choices', () => {
    render(
      <ChoiceGroup
        label="Colori del tema"
        value={null}
        onValueChange={vi.fn()}
        variant="tiles"
        choices={[
          { value: 'var(--primary)', label: 'Primario' },
          { value: 'var(--muted)', label: 'Tenue' },
        ]}
      />,
    );

    expect(
      screen
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-checked')),
    ).toEqual(['false', 'false']);
  });

  it('is one stop in the tab order', () => {
    function Group() {
      const [value, setValue] = useState<Theme>('dark');
      return (
        <ChoiceGroup<Theme>
          label="Tema"
          value={value}
          onValueChange={setValue}
          choices={[
            { value: 'light', label: 'Chiaro' },
            { value: 'dark', label: 'Scuro' },
          ]}
        />
      );
    }
    render(<Group />);

    // The group is the stop, and stepping into it lands on the choice.
    const group = screen.getByRole('radiogroup', { name: 'Tema' });
    expect(group.tabIndex).toBe(0);
    expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual(
      [-1, -1],
    );
    group.focus();
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: 'Scuro' }),
    );
  });
});
