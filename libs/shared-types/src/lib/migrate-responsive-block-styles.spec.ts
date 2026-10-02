import { describe, expect, it } from 'vitest';
import type { PageContent } from './content-model';
import { migrateResponsiveBlockStyles } from './migrate-responsive-block-styles';

/**
 * This function exists FOR content the current type forbids — a flat
 * override is precisely what it has to accept — so its fixtures cannot be
 * built through the type. One cast here, at the only place that needs it,
 * rather than weakening the function's own signature.
 */
const stored = (content: unknown): PageContent => content as PageContent;

describe('migrateResponsiveBlockStyles', () => {
  it('rewrites a flat override as the base size', () => {
    const content = stored([
      {
        id: 'hero-1',
        type: 'Hero',
        props: {},
        styleOverride: { minHeight: '60vh' },
      },
    ]);

    const result = migrateResponsiveBlockStyles(content);

    expect(result.changed).toBe(true);
    expect(result.content[0].styleOverride).toEqual({
      base: { minHeight: '60vh' },
    });
  });

  it('reaches an override nested in children', () => {
    const content = stored([
      {
        id: 'columns-1',
        type: 'Columns',
        props: {},
        children: [
          {
            id: 'text-1',
            type: 'Text',
            props: {},
            styleOverride: { textColor: '#111111' },
          },
        ],
      },
    ]);

    const result = migrateResponsiveBlockStyles(content);

    expect(result.changed).toBe(true);
    expect(result.content[0].children?.[0].styleOverride).toEqual({
      base: { textColor: '#111111' },
    });
  });

  /**
   * What makes it safe to run twice, and safe to run while the editor is
   * still saving: a second pass must not report work it did not do, or the
   * script rewrites every row on every run.
   */
  it('reports nothing changed when everything is already migrated', () => {
    const content = stored([
      {
        id: 'hero-1',
        type: 'Hero',
        props: {},
        styleOverride: { base: { minHeight: '60vh' }, mobile: {} },
      },
    ]);

    const result = migrateResponsiveBlockStyles(content);

    expect(result.changed).toBe(false);
    expect(result.content[0]).toBe(content[0]);
  });

  it('leaves a block with no override alone', () => {
    const content = stored([{ id: 'text-1', type: 'Text', props: {} }]);

    const result = migrateResponsiveBlockStyles(content);

    expect(result.changed).toBe(false);
    expect(result.content[0].styleOverride).toBeUndefined();
  });

  it('never mutates the input', () => {
    const content = stored([
      {
        id: 'hero-1',
        type: 'Hero',
        props: {},
        styleOverride: { minHeight: '60vh' },
      },
    ]);
    const snapshot = JSON.parse(JSON.stringify(content));

    migrateResponsiveBlockStyles(content);

    expect(content).toEqual(snapshot);
  });

  // Every other field of the block travels through untouched — this runs
  // over published content, where losing a prop is losing a live page.
  it('carries the rest of the block through unchanged', () => {
    const content = stored([
      {
        id: 'hero-1',
        type: 'Hero',
        props: { title: 'Ciao', subtitle: 'Mondo' },
        styleOverride: { minHeight: '60vh' },
      },
    ]);

    const result = migrateResponsiveBlockStyles(content);

    expect(result.content[0].props).toEqual({
      title: 'Ciao',
      subtitle: 'Mondo',
    });
    expect(result.content[0].id).toBe('hero-1');
    expect(result.content[0].type).toBe('Hero');
  });
});
