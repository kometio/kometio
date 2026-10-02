import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// Flat-config ESLint resolves eslint.config.mjs relative to the process's
// cwd, not to each linted file's own directory — unlike the old eslintrc
// cascade. Since every Nx project here generates its own eslint.config.mjs
// (extending the root one) and lint-staged always runs from the repo root,
// plain `eslint --fix <file>` silently applies only the root config,
// skipping every project-specific addition (React, jsx-a11y, etc.).
// Group staged files by their nearest ancestor eslint.config.mjs and pass
// it explicitly via --config so each file is linted the same way `nx lint`
// would lint it.
function nearestEslintConfig(file) {
  let dir = dirname(file);
  while (true) {
    const candidate = join(dir, 'eslint.config.mjs');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return 'eslint.config.mjs';
    dir = parent;
  }
}

export default {
  '*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}': [
    (files) => {
      const byConfig = new Map();
      for (const file of files) {
        const config = nearestEslintConfig(file);
        const group = byConfig.get(config) ?? [];
        group.push(relative(process.cwd(), file));
        byConfig.set(config, group);
      }
      return [...byConfig.entries()].map(
        ([config, group]) =>
          `eslint --fix --config ${config} ${group.map((f) => JSON.stringify(f)).join(' ')}`,
      );
    },
    'prettier --write',
  ],
  // Prettier refuses a symbolic link given to it as a path, whether or not the link is ignored, and
  // lint-staged hands it every staged file by name: the first commit of a tree that holds a link
  // (apps/public-site/CLAUDE.md) would stop right here. A link's target is a file of its own.
  '*.{md,json,yml,yaml,html,css}': (files) => {
    const regular = files.filter((file) => !lstatSync(file).isSymbolicLink());
    return regular.length > 0
      ? [`prettier --write ${regular.map((f) => JSON.stringify(f)).join(' ')}`]
      : [];
  },
};
