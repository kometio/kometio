export * from './lib/core-block-types';
export * from './lib/define-block';
export * from './lib/field-types';
export * from './lib/theme-block-glob';
export * from './lib/theme-block-variants';
export * from './lib/theme-style-properties';
export * from './lib/validate-theme-blocks';

/**
 * The zod a theme describes its own blocks with (a `*.block.ts` schema) —
 * core's own copy, so a theme never declares zod itself and never ends up
 * validating with a second instance of it (docs/adr/0089).
 */
export { z } from 'zod';
