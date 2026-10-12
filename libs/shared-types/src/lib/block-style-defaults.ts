import { BLOCK_CONTRACTS } from './block-contracts';
import type { BlockStyleDefaults } from './site-theme-tokens';

/**
 * The default CSS expression for each stylable property (docs/adr/0022) of
 * every block type — copied 1:1 from the fallback the block's `.astro`
 * already uses (`var(--kometio-override-radius, var(--radius))`), not
 * invented: this is the exact same source of truth, only declared here
 * rather than remaining visible solely inside a CSS file.
 *
 * Each block's own defaults are its contract's `style` (ADR-0115), beside
 * its props schema; this record is what they add up to, not a list to edit.
 * It lives in
 * shared-types (not in block-registry) because BOTH `libs/block-registry`
 * (BlockDescriptor.defaultStyle, for editor-app's picker) AND
 * `apps/public-site` (resolve-theme-block-style-defaults.ts, for the
 * `/api/themes/current/block-style-defaults` endpoint) need it — the same
 * reason as `block-style-overrides.ts` in this same file, and not merely a
 * layering whim: making apps/public-site depend on `@kometio/block-registry`
 * (a package oriented around the editor's React components, not pure data)
 * caused a real TypeScript resolution conflict between Astro's
 * configuration and the registry's React test files — see this file's
 * history for the detail. shared-types does not have that problem, being
 * already a pure dependency of both apps. A reference to a theme custom
 * property (`var(--x)`) is resolved against the active theme's `theme.css`
 * on the public-site side only; a literal (`'transparent'`, `'0.5rem'`)
 * passes through unchanged.
 */
export const BLOCK_STYLE_DEFAULTS: Record<string, BlockStyleDefaults> =
  Object.fromEntries(
    BLOCK_CONTRACTS.flatMap((contract) =>
      'style' in contract && contract.style !== undefined
        ? [[contract.type, contract.style] as const]
        : [],
    ),
  );
