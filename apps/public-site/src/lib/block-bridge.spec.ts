import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_STYLE_CUSTOM_PROPERTIES,
  BLOCK_STYLE_DEFAULTS,
} from '@kometio/shared-types';
import {
  BRIDGEABLE,
  blockBridge,
  blockTypeOfFile,
  bridgedValue,
} from '../../block-bridge.mjs';

const STYLE = {
  backgroundColor: 'transparent',
  textColor: 'inherit',
  borderRadius: '0',
  paddingX: '1rem',
  paddingY: '0.5rem',
  gap: 'var(--space)',
};

/** What the plugin makes of a stylesheet that belongs to `file`, as Vite names it. */
async function bridged(
  css: string,
  file = '/app/components/blocks/Quote.astro?astro&type=style&index=0&lang.css',
  styleOf: (type: string) => Record<string, string> | undefined = () => STYLE,
) {
  const result = await postcss([blockBridge({ styleOf })]).process(css, {
    from: file,
  });
  return result.css;
}

describe('@kometio-bridge', () => {
  it('writes the declaration a block would have written, with the contract’s default as the fallback', async () => {
    const css = await bridged(
      '.kometio-quote { @kometio-bridge background color border-radius; }',
    );

    expect(css).toBe(
      '.kometio-quote { background: var(--kometio-override-bg, transparent); color: var(--kometio-override-text, inherit); border-radius: var(--kometio-override-radius, 0); }',
    );
  });

  it('makes a padding of the vertical and the horizontal, in that order', async () => {
    const css = await bridged('.kometio-quote { @kometio-bridge padding; }');

    expect(css).toBe(
      '.kometio-quote { padding: var(--kometio-override-padding-y, 0.5rem) var(--kometio-override-padding-x, 1rem); }',
    );
  });

  it('leaves the declarations around it where they are, and keeps the order the block gave', async () => {
    const css = await bridged(
      '.kometio-quote { display: grid; @kometio-bridge gap background; color: red; }',
    );

    expect(css).toBe(
      '.kometio-quote { display: grid; gap: var(--kometio-override-gap, var(--space)); background: var(--kometio-override-bg, transparent); color: red; }',
    );
  });

  it('keeps it inside a media query, where a block narrows its padding', async () => {
    const css = await bridged(
      '@media (width < 40rem) { .kometio-quote { @kometio-bridge padding; } }',
    );

    expect(css).toContain('padding: var(--kometio-override-padding-y, 0.5rem)');
  });

  it('takes the block from the stylesheet’s file, and not from Astro’s suffix on it', () => {
    expect(
      blockTypeOfFile('/a/b/Hero.astro?astro&type=style&index=1&lang.css'),
    ).toBe('Hero');
    expect(blockTypeOfFile('/a/b/AccordionItem.astro')).toBe('AccordionItem');
  });

  it('names what is wrong, and where, when a block asks for something it cannot have', async () => {
    await expect(
      bridged('.kometio-quote { @kometio-bridge opacity; }'),
    ).rejects.toThrow(
      /"opacity" is not one of the properties a block can bridge/,
    );
    await expect(
      bridged('.kometio-quote { @kometio-bridge border-width; }'),
    ).rejects.toThrow(/Quote's contract has no default for borderWidth/);
    await expect(
      bridged('.kometio-quote { @kometio-bridge; }'),
    ).rejects.toThrow(/names the properties it bridges/);
    await expect(bridged('@kometio-bridge background;')).rejects.toThrow(
      /goes inside a rule/,
    );
    await expect(
      bridged(
        '.x { @kometio-bridge background; }',
        '/app/components/Footer.astro',
        () => undefined,
      ),
    ).rejects.toThrow(/"Footer" is not a block with a contract/);
  });

  it('has a custom property and a place in the contract for everything it can bridge', () => {
    for (const keys of Object.values(BRIDGEABLE)) {
      for (const key of keys) {
        expect(BLOCK_STYLE_CUSTOM_PROPERTIES[key]).toMatch(
          /^--kometio-override-/,
        );
      }
    }
    expect(() => bridgedValue('Quote', 'gap', STYLE)).not.toThrow();
  });
});

describe('the blocks that use it', () => {
  const dir = join(import.meta.dirname, '../components/blocks');
  const allStyleBlocks = readdirSync(dir)
    .filter((file) => file.endsWith('.astro'))
    .flatMap((file) =>
      [
        ...readFileSync(join(dir, file), 'utf8').matchAll(
          /<style[^>]*>([\s\S]*?)<\/style>/g,
        ),
      ].map((match) => ({ file, css: match[1] ?? '' })),
    );
  const styleBlocks = allStyleBlocks.filter(({ css }) =>
    css.includes('@kometio-bridge'),
  );

  it('are found, so that this is not a test of nothing', () => {
    expect(styleBlocks.length).toBeGreaterThan(0);
  });

  it.each(styleBlocks)(
    '$file asks only for what its contract declares',
    async ({ file, css }) => {
      const result = await postcss([blockBridge()]).process(css, {
        from: join(dir, `${file}?astro&type=style&index=0&lang.css`),
      });

      expect(result.css).not.toContain('@kometio-bridge');
      expect(BLOCK_STYLE_DEFAULTS[blockTypeOfFile(file)]).toBeDefined();
    },
  );

  it('write by hand only what the directive cannot say', () => {
    const squash = (value: string) =>
      value
        .replace(/\s+/g, ' ')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .trim();
    const written: string[] = [];

    for (const { file, css } of allStyleBlocks) {
      const style = BLOCK_STYLE_DEFAULTS[blockTypeOfFile(file)];
      if (style === undefined) continue;
      postcss.parse(css).walkDecls((declaration) => {
        const keys = BRIDGEABLE[declaration.prop];
        if (keys === undefined || declaration.important) return;
        if (!keys.every((key) => style[key] !== undefined)) return;
        const bridgedForm = bridgedValue(
          blockTypeOfFile(file),
          declaration.prop,
          style,
        );
        if (squash(declaration.value) === squash(bridgedForm)) {
          const selector =
            declaration.parent?.type === 'rule'
              ? declaration.parent.selector
              : '';
          written.push(
            `${file}: ${squash(selector)} { ${declaration.prop} } is what @kometio-bridge writes`,
          );
        }
      });
    }

    expect(written).toEqual([]);
  });
});
