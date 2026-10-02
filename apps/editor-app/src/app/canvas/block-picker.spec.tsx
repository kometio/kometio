import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BlockDescriptor } from '@kometio/block-registry';
import { BlockPicker } from './block-picker';

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: '', subtitle: '' },
  fields: [],
};
const textDescriptor: BlockDescriptor = {
  type: 'Text',
  label: 'Testo',
  category: 'content',
  defaultProps: { body: '' },
  fields: [],
};

const columnsDescriptor: BlockDescriptor = {
  type: 'Columns',
  label: 'Colonne',
  category: 'layout',
  defaultProps: {},
  fields: [],
};

describe('BlockPicker', () => {
  /*
   * A Column belongs inside Columns. Offering it with nothing selected
   * offers a block that cannot be placed anywhere.
   */
  it('leaves out the blocks that have nowhere to go right now', () => {
    render(
      <BlockPicker
        categories={[{ title: 'Layout', types: ['Columns', 'Column'] }]}
        registry={[
          columnsDescriptor,
          {
            type: 'Column',
            label: 'Colonna',
            category: 'layout',
            defaultProps: {},
            fields: [],
            allowedParentTypes: ['Columns'],
          },
        ]}
        onInsert={vi.fn()}
        canInsert={(descriptor) => descriptor.type !== 'Column'}
      />,
    );

    expect(screen.getByText('Colonne')).toBeTruthy();
    expect(screen.queryByText('Colonna')).toBeNull();
  });

  /*
   * Every category open, not an accordion. Closed sections meant the
   * panel showed six words and no blocks: to learn a Countdown exists
   * you had to open three of them, or already know its name well enough
   * to search for it. Answering "what can I put here" is the whole job.
   */
  it('shows every block under its category heading, with nothing to expand first', () => {
    render(
      <BlockPicker
        categories={[{ title: 'Contenuto', types: ['Hero', 'Text'] }]}
        registry={[heroDescriptor, textDescriptor]}
        onInsert={vi.fn()}
      />,
    );

    expect(screen.getByText('Contenuto')).toBeDefined();
    expect(screen.getByText('Hero')).toBeDefined();
    expect(screen.getByText('Testo')).toBeDefined();
  });

  it('calls onInsert with the full descriptor when a block button is clicked', () => {
    const onInsert = vi.fn();
    render(
      <BlockPicker
        categories={[{ title: 'Contenuto', types: ['Hero'] }]}
        registry={[heroDescriptor]}
        onInsert={onInsert}
      />,
    );

    fireEvent.click(screen.getByText('Contenuto'));
    fireEvent.click(screen.getByText('Hero'));

    expect(onInsert).toHaveBeenCalledWith(heroDescriptor);
  });

  it('skips a category type that has no matching registry entry, instead of crashing', () => {
    render(
      <BlockPicker
        categories={[{ title: 'Contenuto', types: ['Ghost'] }]}
        registry={[heroDescriptor]}
        onInsert={vi.fn()}
      />,
    );

    expect(screen.queryByText('Contenuto')).toBeNull();
  });

  it('keeps multiple categories open at the same time', () => {
    render(
      <BlockPicker
        categories={[
          { title: 'Contenuto', types: ['Hero'] },
          { title: 'Testuale', types: ['Text'] },
        ]}
        registry={[heroDescriptor, textDescriptor]}
        onInsert={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Contenuto'));
    fireEvent.click(screen.getByText('Testuale'));

    expect(screen.getByRole('button', { name: 'Hero' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Testo' })).toBeDefined();
  });
});

/*
 * 53 insertable types in collapsed accordion sections: without a search
 * field, finding one meant knowing which category somebody had filed it
 * under. That is the item Fase 7 lists, and these are the three things it
 * has to get right.
 */
describe('searching the picker', () => {
  function renderPicker() {
    render(
      <BlockPicker
        categories={[
          { title: 'Contenuto', types: ['Hero', 'Text'] },
          { title: 'Layout', types: ['Columns'] },
        ]}
        registry={[heroDescriptor, textDescriptor, columnsDescriptor]}
        onInsert={vi.fn()}
      />,
    );
    return screen.getByRole('searchbox');
  }

  /*
   * A search that found three blocks and left them behind collapsed
   * sections would look like a search that found nothing.
   */
  it('opens the matching sections instead of leaving the results hidden', () => {
    fireEvent.change(renderPicker(), { target: { value: 'hero' } });

    expect(screen.getByText('Hero')).toBeDefined();
    expect(screen.queryByText('Testo')).toBeNull();
    expect(screen.queryByText('Layout')).toBeNull();
  });

  /*
   * Somebody reading the UI types "Testo"; somebody reading the docs types
   * "Text". Matching only one of the two is a search that works if you
   * already knew where to look.
   */
  it('matches the translated label and the type name alike', () => {
    const box = renderPicker();

    fireEvent.change(box, { target: { value: 'testo' } });
    expect(screen.getByText('Testo')).toBeDefined();

    fireEvent.change(box, { target: { value: 'text' } });
    expect(screen.getByText('Testo')).toBeDefined();
  });

  it('says so when nothing matches, rather than showing an empty list', () => {
    fireEvent.change(renderPicker(), { target: { value: 'zzz' } });

    expect(screen.queryByText('Contenuto')).toBeNull();
    expect(screen.getByText(/zzz/)).toBeDefined();
  });
});
