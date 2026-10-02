import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../components/ui/tooltip';
import { LocaleListEditor } from './locale-list-editor';

function renderEditor(
  enabledLocales: string[],
  defaultLocale: string,
  onChange: (enabledLocales: string[], defaultLocale: string) => void = vi.fn(),
) {
  return render(
    <TooltipProvider>
      <LocaleListEditor
        enabledLocales={enabledLocales}
        defaultLocale={defaultLocale}
        onChange={onChange}
      />
    </TooltipProvider>,
  );
}

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /aggiungi lingua/i }));
}

describe('LocaleListEditor', () => {
  it('shows the enabled locales with the default one badged', () => {
    renderEditor(['it-it', 'en-us'], 'it-it');

    expect(screen.getByText('it-it')).toBeTruthy();
    expect(screen.getByText('en-us')).toBeTruthy();
    expect(screen.getByText('Predefinita')).toBeTruthy();
  });

  it('adds a locale picked from the curated list, lowercased', () => {
    const onChange = vi.fn();
    renderEditor(['it-it'], 'it-it', onChange);
    openPicker();

    fireEvent.change(screen.getByPlaceholderText('Cerca una lingua...'), {
      target: { value: 'EN-US' },
    });
    fireEvent.click(screen.getByRole('button', { name: /en-us/i }));

    expect(onChange).toHaveBeenCalledWith(['it-it', 'en-us'], 'it-it');
  });

  it('filters by display name too, not just the code', () => {
    // The test i18n instance's active language is Italian, so display
    // names come back in Italian (getLocaleDisplayName(code, 'it')).
    renderEditor(['it-it'], 'it-it');
    openPicker();

    fireEvent.change(screen.getByPlaceholderText('Cerca una lingua...'), {
      target: { value: 'francese' },
    });

    expect(screen.getByRole('button', { name: /fr-fr/i })).toBeTruthy();
  });

  // Filtering on "contains" alone put "Inglese (Sudafrica)" ahead of French
  // for `fr`, and Enter takes the first result.
  it('offers the codes and names that start with what was typed before those that only contain it', () => {
    const onChange = vi.fn();
    renderEditor(['it-it'], 'it-it', onChange);
    openPicker();
    const search = screen.getByPlaceholderText('Cerca una lingua...');

    fireEvent.change(search, { target: { value: 'fr' } });
    const offered = screen
      .getAllByRole('button', { name: /(fr|en)-[a-z]{2}\b/i })
      .map((button) => button.textContent?.toLowerCase() ?? '');
    const position = (code: string) =>
      offered.findIndex((text) => text.includes(code));
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(position('fr-fr')).toBe(0);
    expect(position('en-za')).toBeGreaterThan(position('fr-ca'));
    expect(onChange).toHaveBeenCalledWith(['it-it', 'fr-fr'], 'it-it');
  });

  it('excludes already-enabled locales from the picker results', () => {
    renderEditor(['it-it'], 'it-it');
    openPicker();

    fireEvent.change(screen.getByPlaceholderText('Cerca una lingua...'), {
      target: { value: 'it-it' },
    });

    expect(screen.getByText('Nessuna lingua trovata')).toBeTruthy();
  });

  it('sets a non-default locale as the new default', () => {
    const onChange = vi.fn();
    renderEditor(['it-it', 'en-us'], 'it-it', onChange);

    fireEvent.click(
      screen.getByRole('button', {
        name: /^imposta inglese.* come predefinita/i,
      }),
    );

    expect(onChange).toHaveBeenCalledWith(['it-it', 'en-us'], 'en-us');
  });

  it('removes a locale that is not the default', () => {
    const onChange = vi.fn();
    renderEditor(['it-it', 'en-us'], 'it-it', onChange);

    fireEvent.click(screen.getByRole('button', { name: /^rimuovi inglese/i }));

    expect(onChange).toHaveBeenCalledWith(['it-it'], 'it-it');
  });

  // Which language the site falls back on is not settled by taking it away.
  it('cannot remove the default locale, and says what to do instead', () => {
    const onChange = vi.fn();
    renderEditor(['it-it', 'en-us'], 'it-it', onChange);

    const remove = screen.getByRole('button', {
      name: /^rimuovi italiano/i,
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    expect(
      screen.getByText(/scegline prima un’altra come predefinita/i),
    ).toBeTruthy();

    // Once another one is the default, this one can go.
    fireEvent.click(
      screen.getByRole('button', {
        name: /^imposta inglese.* come predefinita/i,
      }),
    );
    expect(onChange).toHaveBeenCalledWith(['it-it', 'en-us'], 'en-us');
  });

  it('cannot remove the last remaining locale, and says why', () => {
    renderEditor(['it-it'], 'it-it');

    const removeButton = screen.getByRole('button', {
      name: /^rimuovi italiano/i,
    }) as HTMLButtonElement;
    expect(removeButton.disabled).toBe(true);
    expect(
      screen.getByText('Il sito ha bisogno di almeno una lingua.'),
    ).toBeTruthy();
  });

  it('writes the word on the button, not only a bin', () => {
    renderEditor(['it-it', 'en-us'], 'it-it');

    expect(
      screen.getByRole('button', { name: /^rimuovi inglese/i }).textContent,
    ).toBe('Rimuovi');
  });
});
