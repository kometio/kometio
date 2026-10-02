/*
 * The rows integration specs create and delete. A separate entry point, not
 * part of the index: apps/api bundles every export of the modules it
 * reaches (webpack runs with `optimization: false`), so helpers exported
 * from the index shipped in the production build without anyone calling
 * them. Specs import them from `@kometio/postgres-db/testing`.
 */
export * from './lib/integration-test-cleanup';
export * from './lib/integration-test-fixtures';
