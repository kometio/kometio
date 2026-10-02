import { describe, expect, it } from 'vitest';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { onlyAllowedChildLabel } from './only-allowed-child-label';

/**
 * The empty-container hint names what the container is waiting for, and
 * the name comes from `@kometio/theme-runtime`'s catalogue — a different
 * one from the editor's, because the public site cannot read the
 * editor's. Nothing at runtime complains when a label is missing there:
 * `Translator.t` returns the key, so the canvas would read "add a
 * blocks.tab.label from the sidebar" and look like a bug in the copy.
 */
describe('onlyAllowedChildLabel', () => {
  const containers = [...pageBlocks, ...headerFooterBlocks].filter(
    (block) => block.allowedChildTypes?.length === 1,
  );

  it('finds containers that accept exactly one type', () => {
    expect(containers.length).toBeGreaterThan(5);
  });

  it.each(['en', 'it'])(
    'gives every one of them a real name in %s, not an i18n key',
    (locale) => {
      const unnamed = containers
        .map((block) => ({
          type: block.type,
          label: onlyAllowedChildLabel(block.type, locale),
        }))
        .filter((entry) => !entry.label || entry.label.includes('.label'));
      expect(unnamed).toEqual([]);
    },
  );

  it('says nothing for a container that genuinely takes anything', () => {
    // Container and Column accept any block: there is no single answer to
    // name, and inventing one is worse than the generic sentence.
    expect(onlyAllowedChildLabel('Container', 'en')).toBeNull();
    expect(onlyAllowedChildLabel('Text', 'en')).toBeNull();
  });
});
