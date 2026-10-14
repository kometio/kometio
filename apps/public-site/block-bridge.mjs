// `@kometio-bridge`: the line a block writes in its own <style> to say "this
// property of my root is the one the Style dialog edits" (docs/adr/0133).
//
//   .kometio-quote {
//     @kometio-bridge background color border-radius padding;
//   }
//
// becomes, before anything else reads the stylesheet,
//
//   .kometio-quote {
//     background: var(--kometio-override-bg, transparent);
//     color: var(--kometio-override-text, inherit);
//     border-radius: var(--kometio-override-radius, 0);
//     padding: var(--kometio-override-padding-y, 0) var(--kometio-override-padding-x, 0);
//   }
//
// The name of each custom property is `BLOCK_STYLE_CUSTOM_PROPERTIES`'s, which
// the page's own `<style>` and the canvas write to; the fallback is the block's
// contract `style`, which the editor shows as the field's placeholder. They were
// two copies of the same value in two files, kept equal by hand; this is the
// one place they are put together.
//
// A PostCSS plugin and not a rule that is written out in a shared stylesheet:
// what comes out is the same scoped, unlayered declaration a block wrote by
// hand, at the same specificity, so a theme's own rules win and lose exactly as
// they did. Each property is named by what it sets, so there is nothing to
// learn that a stylesheet does not already say.
import { basename } from 'node:path';
import {
  BLOCK_STYLE_CUSTOM_PROPERTIES,
  BLOCK_STYLE_DEFAULTS,
} from '@kometio/shared-types';

export const DIRECTIVE = 'kometio-bridge';

/** @typedef {Exclude<keyof import('@kometio/shared-types').BlockStyleDefaults, 'marginTop' | 'marginBottom'>} StyleKey */

/**
 * The CSS property a block bridges, and the contract's style properties that
 * make its value, in the order they are written (`padding` is two: the block's
 * own vertical and horizontal).
 *
 * @type {Readonly<Record<string, readonly StyleKey[]>>}
 */
export const BRIDGEABLE = {
  background: ['backgroundColor'],
  color: ['textColor'],
  'border-radius': ['borderRadius'],
  padding: ['paddingY', 'paddingX'],
  'border-width': ['borderWidth'],
  'border-style': ['borderStyle'],
  'border-color': ['borderColor'],
  'box-shadow': ['boxShadow'],
  gap: ['gap'],
  'max-width': ['maxWidth'],
  'min-height': ['minHeight'],
};

/** The block type a stylesheet belongs to: `Quote.astro?astro&type=style…` is `Quote`. */
export function blockTypeOfFile(file) {
  return basename(file.split('?')[0]).replace(/\.astro$/, '');
}

/**
 * The declaration one bridged property comes to for a block's contract style.
 * Throws a message that names what is missing: a bridge to a default the
 * contract does not declare is a field in the Style dialog with no placeholder.
 */
export function bridgedValue(type, property, style) {
  const keys = BRIDGEABLE[property];
  if (!keys) {
    throw new Error(
      `"${property}" is not one of the properties a block can bridge (${Object.keys(BRIDGEABLE).join(', ')}); a property that is not one of them is written by hand`,
    );
  }
  return keys
    .map((key) => {
      const fallback = style[key];
      if (fallback === undefined) {
        throw new Error(
          `${type}'s contract has no default for ${key} (its \`style\`), which bridging ${property} reads as the fallback`,
        );
      }
      return `var(${BLOCK_STYLE_CUSTOM_PROPERTIES[key]}, ${fallback})`;
    })
    .join(' ');
}

/**
 * @param {{ styleOf?: (type: string) => Record<string, string> | undefined }} [options]
 *   Where a type's contract style comes from; the contracts', unless a test says.
 */
export function blockBridge({
  styleOf = (type) => BLOCK_STYLE_DEFAULTS[type],
} = {}) {
  return {
    postcssPlugin: 'kometio-block-bridge',
    AtRule: {
      [DIRECTIVE](atRule, { Declaration }) {
        const file = atRule.source?.input.file;
        if (!file) {
          throw atRule.error(
            `@${DIRECTIVE} needs to know which block's stylesheet it is in, and this one has no file`,
          );
        }
        const type = blockTypeOfFile(file);
        const style = styleOf(type);
        if (!style) {
          throw atRule.error(
            `@${DIRECTIVE} is for a block's own stylesheet, and "${type}" is not a block with a contract`,
          );
        }
        if (atRule.parent?.type !== 'rule') {
          throw atRule.error(
            `@${DIRECTIVE} goes inside a rule, where the declarations it makes belong`,
          );
        }
        const properties = atRule.params.split(/\s+/).filter(Boolean);
        if (properties.length === 0) {
          throw atRule.error(
            `@${DIRECTIVE} names the properties it bridges: @${DIRECTIVE} background color;`,
          );
        }
        const declarations = properties.map((property) => {
          try {
            return new Declaration({
              prop: property,
              value: bridgedValue(type, property, style),
              source: atRule.source,
            });
          } catch (error) {
            throw atRule.error(error.message);
          }
        });
        atRule.replaceWith(declarations);
      },
    },
  };
}
