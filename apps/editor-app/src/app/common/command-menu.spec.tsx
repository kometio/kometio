import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CommandMenu,
  filterCommands,
  type CommandGroup,
  type CommandItem,
} from './command-menu';

const groups: CommandGroup[] = [
  { id: 'insert', label: 'Aggiungi un blocco' },
  { id: 'layers', label: 'Vai a un livello' },
  { id: 'page', label: 'Questa pagina' },
  { id: 'editor', label: 'Editor' },
];

const items: CommandItem[] = [
  { id: 'editor:publish', group: 'editor', label: 'Pubblica' },
  { id: 'insert:Hero', group: 'insert', label: 'Hero', keywords: 'Hero' },
  { id: 'layer:a', group: 'layers', label: 'Titolo', detail: 'Colonne' },
  { id: 'insert:Text', group: 'insert', label: 'Testo', keywords: 'Text' },
  { id: 'page:0', group: 'page', label: 'Cronologia versioni' },
];

describe('filterCommands', () => {
  it('lists every entry grouped in a fixed order when nothing is typed', () => {
    expect(filterCommands(items, '', groups).map((item) => item.id)).toEqual([
      'insert:Hero',
      'insert:Text',
      'layer:a',
      'page:0',
      'editor:publish',
    ]);
  });

  it('matches every word, ignoring case and accents, in the label or the keywords', () => {
    expect(
      filterCommands(items, 'TEXT', groups).map((item) => item.id),
    ).toEqual(['insert:Text']);
    expect(
      filterCommands(items, 'cronologia vers', groups).map((i) => i.id),
    ).toEqual(['page:0']);
    expect(filterCommands(items, 'pubblicà', groups).map((i) => i.id)).toEqual([
      'editor:publish',
    ]);
  });
});

describe('filterCommands — groups', () => {
  it('lists the groups in the order it is given, whatever the order of the entries', () => {
    const shell: CommandGroup[] = [
      { id: 'editor', label: 'Editor' },
      { id: 'insert', label: 'Aggiungi un blocco' },
    ];

    expect(filterCommands(items, '', shell).map((item) => item.id)).toEqual([
      'editor:publish',
      'insert:Hero',
      'insert:Text',
    ]);
  });

  it('leaves out an entry whose group the menu does not have', () => {
    const only: CommandGroup[] = [{ id: 'page', label: 'Questa pagina' }];

    expect(filterCommands(items, '', only).map((item) => item.id)).toEqual([
      'page:0',
    ]);
  });
});

describe('CommandMenu', () => {
  function setup(
    extra: Partial<React.ComponentProps<typeof CommandMenu>> = {},
  ) {
    const onRun = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandMenu
        open
        onOpenChange={onOpenChange}
        title="Cerca blocchi e comandi"
        placeholder="Un blocco da aggiungere…"
        groups={groups}
        items={items}
        onRun={onRun}
        {...extra}
      />,
    );
    const field = screen.getByRole('combobox', {
      name: 'Cerca blocchi e comandi',
    });
    return { onRun, onOpenChange, field };
  }

  it('runs the entry chosen with the arrows and Enter, and closes', () => {
    const { onRun, onOpenChange, field } = setup();

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'insert:Text' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps focus in the field and points it at the highlighted option', () => {
    const { field } = setup();

    fireEvent.keyDown(field, { key: 'End' });

    const active = field.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(document.getElementById(active ?? '')?.textContent).toBe('Pubblica');
  });

  it('says so when nothing matches', () => {
    const { field } = setup();

    fireEvent.change(field, { target: { value: 'zzz' } });

    expect(screen.getByText('Nessun risultato per “zzz”.')).toBeTruthy();
  });

  it('runs an entry on click', () => {
    const { onRun } = setup();

    fireEvent.click(screen.getByRole('option', { name: /Titolo/ }));

    expect(onRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'layer:a' }),
    );
  });

  it('heads each group with its own words, once', () => {
    setup();

    expect(screen.getAllByText('Aggiungi un blocco')).toHaveLength(1);
    expect(screen.getByText('Questa pagina')).toBeTruthy();
    expect(screen.getByText('Editor')).toBeTruthy();
  });

  it('names the field with the title it was given, and shows its placeholder', () => {
    render(
      <CommandMenu
        open
        onOpenChange={vi.fn()}
        title="Cerca nell’editor"
        placeholder="Una pagina, un file…"
        groups={groups}
        items={items}
        onRun={vi.fn()}
      />,
    );

    const field = screen.getByRole('combobox', { name: 'Cerca nell’editor' });
    expect(field.getAttribute('placeholder')).toBe('Una pagina, un file…');
    expect(
      screen.getByRole('dialog', { name: 'Cerca nell’editor' }),
    ).toBeTruthy();
  });

  it('tells whoever is searching for it what is typed, and when it is cleared', () => {
    const onQueryChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandMenu
        open
        onOpenChange={onOpenChange}
        title="Cerca"
        placeholder="…"
        groups={groups}
        items={items}
        onRun={vi.fn()}
        onQueryChange={onQueryChange}
      />,
    );
    const field = screen.getByRole('combobox', { name: 'Cerca' });

    fireEvent.change(field, { target: { value: 'testo' } });
    expect(onQueryChange).toHaveBeenLastCalledWith('testo');

    // Running the one entry closes the menu, and the next opening starts
    // from nothing typed: the source is told so too.
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onQueryChange).toHaveBeenLastCalledWith('');
  });

  it('says it is searching while an answer is on its way, instead of "no results"', () => {
    setup({ loading: true });
    const field = screen.getByRole('combobox');

    fireEvent.change(field, { target: { value: 'zzz' } });

    expect(screen.getByRole('status').textContent).toBe('Ricerca…');
    expect(screen.queryByText(/Nessun risultato/)).toBeNull();
  });

  it('does not say it is searching when it is not', () => {
    setup();

    expect(screen.queryByRole('status')).toBeNull();
  });
});
