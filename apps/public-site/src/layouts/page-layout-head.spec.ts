import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The layer order has to be the FIRST style the browser sees: a layer is
 * ranked where it is first named, and the block styles below name ours.
 * cascade-layers.spec.ts checks the statement itself; nothing checked that
 * the page emits it, so deleting the line would bring the bug back with a
 * green suite. There is no browser in these tests, so this reads the file.
 */
describe('PageLayout head', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./PageLayout.astro', import.meta.url)),
    'utf8',
  );
  const head = source.slice(
    source.indexOf('<head>'),
    source.indexOf('</head>'),
  );

  it('emits the cascade layer order before any other style or stylesheet', () => {
    const firstStyle = head.search(/<style|<link rel="stylesheet"/);
    expect(firstStyle).toBeGreaterThan(-1);
    const firstStyleTag = head.slice(firstStyle, head.indexOf('>', firstStyle));

    expect(firstStyleTag).toContain('CASCADE_LAYER_ORDER_CSS');
  });

  it('imports it from the one place that defines the order', () => {
    expect(source).toMatch(
      /import \{ CASCADE_LAYER_ORDER_CSS \} from '\.\.\/lib\/cascade-layers'/,
    );
  });
});
