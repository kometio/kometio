import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Translator } from '@kometio/theme-runtime';

/**
 * A header and a footer that each have a navigation are two landmarks of the
 * same kind, and axe reports it (landmark-unique) on every page that has both,
 * on every theme: the navigation had no name, and did not know where it sat.
 * It is handed the region now, and names itself from it.
 *
 * Read as source, because a vitest project with this config cannot import an
 * `.astro` file (the same reason block-components.spec reads them); the real
 * browser check was run on a built site.
 */
const SRC = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

describe('the navigations of the header and the footer have names', () => {
  it('draws the header and the footer with the region they are', () => {
    const layout = read('layouts/PageLayout.astro');

    expect(layout).toMatch(/region="header"/);
    expect(layout).toMatch(/region="footer"/);
  });

  it('hands the region down to what a block holds', () => {
    const renderer = read('components/BlockRenderer.astro');

    expect(renderer).toMatch(/region=\{region\}/);
  });

  it('names the landmark from its region, and leaves one in the content alone', () => {
    const nav = read('components/blocks/Nav.astro');

    expect(nav).toMatch(
      /aria-label=\{region \? i18n\.t\(`nav\.\$\{region\}`\) : undefined\}/,
    );
  });

  it.each(['en', 'it'])(
    'has the two names in %s, and not the same one twice',
    (language) => {
      const words = new Translator(language);

      // A key the dictionary lacks comes back as itself.
      expect(words.t('nav.header')).not.toBe('nav.header');
      expect(words.t('nav.footer')).not.toBe('nav.footer');
      expect(words.t('nav.header')).not.toBe(words.t('nav.footer'));
    },
  );
});
