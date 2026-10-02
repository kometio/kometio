/**
 * `FieldDescriptor`/`BlockDescriptor`/`FieldBuilder` now live in
 * `@kometio/block-sdk` (see libs/block-sdk/README.md) — this file re-exports
 * them so every existing `import type { BlockDescriptor } from
 * '../field-types'` across this lib's ~49 `*.block.ts` files keeps working
 * unchanged. `block-registry` depends on `block-sdk` for this contract, not
 * the other way around: `block-sdk` (the public extension surface) can't
 * depend on `block-registry` (the internal 49 first-party blocks built
 * against that surface) without a circular dependency.
 */
export * from '@kometio/block-sdk';
