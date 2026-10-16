#!/usr/bin/env -S pnpm exec tsx
/**
 * Checks the block types a theme adds, the way the running site will, so a
 * wrong one stops the BUILD.
 *
 * The site checks them too (apps/public-site/src/lib/resolve-theme-page-blocks.ts)
 * and throws when one is wrong, on the first page it draws. That was written
 * for a developer at their own terminal. It is not what happens to a theme
 * that is built in an image or uploaded in the editor (docs/adr/0089,
 * docs/adr/0091): there the build succeeds, the site starts, and every page,
 * with or without the block, answers "Internal server error", and nothing on
 * the screen says why. A theme with one block whose category is not allowed did
 * exactly that.
 *
 *   pnpm exec tsx tools/validate-theme-blocks.mts <name>
 *
 * `<name>` is the theme's directory under themes/. Exit status 1, and the
 * list of what is wrong, when a block is.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// By path, not by package name: `tools/` is outside the pnpm workspace, so
// `@kometio/*` does not resolve from here (the same as the other tools).
import {
  CORE_BLOCK_TYPES,
  collectThemeBlockCandidates,
  validateThemeBlockSet,
  type BlockDescriptor,
  type ThemeBlockCandidate,
} from '../libs/block-sdk/src/index';

const BLOCK_SUFFIX = '.block.ts';
const LOCALES_SUFFIX = '.locales.json';
const COMPONENT_SUFFIX = '.astro';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDescriptor(value: unknown): value is BlockDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

function hasParse(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'parse' in value &&
    typeof value.parse === 'function'
  );
}

/** What is wrong with the blocks under `<themeDir>/blocks/`, one line each; nothing when they are fine or there are none. */
export async function themeBlockProblems(themeDir: string): Promise<string[]> {
  const blocksDir = join(themeDir, 'blocks');
  if (!existsSync(blocksDir)) return [];
  const files = readdirSync(blocksDir);
  const problems: string[] = [];

  const blockModules: Record<string, { default: BlockDescriptor }> = {};
  for (const file of files.filter((name) => name.endsWith(BLOCK_SUFFIX))) {
    const basename = file.slice(0, -BLOCK_SUFFIX.length);
    let loaded: unknown;
    try {
      loaded = await import(pathToFileURL(join(blocksDir, file)).href);
    } catch (error) {
      // defineBlock() parses the defaults against the schema as the file
      // loads, so a default that does not fit arrives here.
      problems.push(
        `${basename}: ${file} could not be loaded: ${messageOf(error)}`,
      );
      continue;
    }
    const descriptor =
      typeof loaded === 'object' && loaded !== null && 'default' in loaded
        ? loaded.default
        : undefined;
    if (!isDescriptor(descriptor)) {
      problems.push(
        `${basename}: ${file} must export the descriptor defineBlock() returns as its default export`,
      );
      continue;
    }
    // The site draws a block only if it has the schema to check its props
    // with, and leaves it out, silently, when it has none.
    const schema =
      typeof loaded === 'object' && loaded !== null && 'schema' in loaded
        ? loaded.schema
        : undefined;
    if (!hasParse(schema)) {
      problems.push(
        `${basename}: ${file} must also export its schema as \`schema\` (export { …PropsSchema as schema }), or the site leaves the block out`,
      );
    }
    blockModules[file] = { default: descriptor };
  }

  const componentModules: Record<string, unknown> = {};
  for (const file of files.filter((name) => name.endsWith(COMPONENT_SUFFIX))) {
    componentModules[file] = true;
  }

  const localesModules: Record<string, ThemeBlockCandidate['locales']> = {};
  for (const file of files.filter((name) => name.endsWith(LOCALES_SUFFIX))) {
    try {
      localesModules[file] = JSON.parse(
        readFileSync(join(blocksDir, file), 'utf8'),
      );
    } catch (error) {
      problems.push(
        `${file.slice(0, -LOCALES_SUFFIX.length)}: ${file} is not valid JSON: ${messageOf(error)}`,
      );
    }
  }

  const candidates = collectThemeBlockCandidates(
    blockModules,
    componentModules,
    localesModules,
  );
  const core = new Set(CORE_BLOCK_TYPES);
  for (const candidate of candidates) {
    if (core.has(candidate.descriptor.type)) {
      problems.push(
        `${candidate.basename}: type "${candidate.descriptor.type}" collides with a core block; a theme replaces a block with "${candidate.descriptor.type}.astro" alone (no .block.ts), or picks another name to add one`,
      );
    }
  }
  for (const error of validateThemeBlockSet(candidates)) {
    problems.push(`${error.basename}: ${error.message}`);
  }
  return problems;
}

// Run as a command: `tsx tools/validate-theme-blocks.mts <name>`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const name = process.argv[2];
  if (!name) {
    console.error('Name the theme: tsx tools/validate-theme-blocks.mts <name>');
    process.exit(2);
  }
  const themeDir = resolve(import.meta.dirname, '..', 'themes', name);
  const problems = await themeBlockProblems(themeDir);
  if (problems.length > 0) {
    console.error(
      `\n✖ The blocks of themes/${name} are not valid:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n') +
        '\n\nThe site would answer "Internal server error" on every page; ' +
        'themes/README.md ("Adding a genuinely new block type") says what a block is.\n',
    );
    process.exit(1);
  }
}
