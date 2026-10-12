// What `tools/check-runtime-dependencies.mjs` decides, as a function of the
// projects it is given, so that it can be tested without a repository.
//
// `pnpm audit --prod` is what blocks a pull request (ci.yml, job `audit`):
// the `dependencies` of every project, taken to be what ships. That holds
// only while nothing that ships is declared as a `devDependency`. A library
// that is imported by a project's source and named only among its
// `devDependencies` would be bundled into an image or the editor's bundle
// and never audited by the blocking job.
//
// What counts as source is everything but what is KNOWN not to ship: the
// exclusions below are narrow on purpose. A check like this one that guesses
// wrong in the other direction passes in silence, and nobody finds out.

/** Files that are source: what a bundler or a server reads. */
const SOURCE = /\.(ts|tsx|mjs|js|astro)$/;

/**
 * What does not ship, by the path from the root of the project: tests and
 * their fixtures and setup, an end-to-end suite, a tool's own configuration,
 * and `scripts/` at the root of a project (run by hand, in no bundle).
 *
 * Anchored, never "anywhere in the path": `src/scripts/` is source and
 * ships, a file called `site.config.ts` is source, and neither is excused by
 * a name that happens to look like a tool's.
 */
const NOT_SHIPPED = [
  /\.(spec|test|e2e)\.[cm]?[jt]sx?$/,
  /\.test-fixture\.[cm]?[jt]sx?$/,
  /(^|\/)test-setup\.[cm]?[jt]s$/,
  /(^|\/)jest\.setup\.[cm]?[jt]s$/,
  /^(src\/)?(test|tests|e2e)\//,
  /^scripts\//,
  /^(eslint|vitest|vite|jest|astro|drizzle|webpack|tailwind|postcss|playwright(\.[a-z-]+)?)\.config\.[cm]?[jt]s$/,
];

/**
 * Every way a library is named in source: `from 'x'` (import and
 * re-export), `import 'x'`, `import('x')`, `import.meta.resolve('x')`,
 * `require('x')` and `require.resolve('x')`. The public site reaches its
 * icon sets through `import.meta.resolve`, and only through it.
 */
const IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\bimport\.meta\.resolve\s*\(\s*|\brequire(?:\.resolve)?\s*\(\s*)['"]((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:\/[^'"]*)?['"]/gi;

/**
 * The projects that are test suites from end to end: nothing of them is in
 * an image or a bundle. Named, one by one, rather than recognised by a word
 * in a path.
 */
const NOT_SHIPPING_PROJECTS = new Set(['apps/e2e']);

/**
 * A theme is compiled into the public site, which provides `astro` to it:
 * it names it as a dev dependency to be able to type-check on its own.
 */
const PROVIDED = { themes: new Set(['astro']) };

/** Whether a source file is one that ships, given its path from the project's root. */
function ships(pathInProject) {
  return (
    SOURCE.test(pathInProject) &&
    !NOT_SHIPPED.some((pattern) => pattern.test(pathInProject))
  );
}

/**
 * @param {{ directory: string, packageJson: object, files: Record<string, string> }[]} projects
 * @returns {{ file: string, package: string }[]}
 */
export function violations(projects) {
  const found = [];
  for (const { directory, packageJson, files } of projects) {
    if (NOT_SHIPPING_PROJECTS.has(directory)) continue;
    const declaredForDevelopmentOnly = new Set(
      Object.keys(packageJson.devDependencies ?? {}).filter(
        (name) => !name.startsWith('@kometio/') && !name.startsWith('@types/'),
      ),
    );
    for (const name of [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ]) {
      declaredForDevelopmentOnly.delete(name);
    }
    if (declaredForDevelopmentOnly.size === 0) continue;
    const provided = PROVIDED[directory.split('/')[0]] ?? new Set();
    for (const [file, text] of Object.entries(files)) {
      if (!ships(file.slice(directory.length + 1))) continue;
      for (const match of text.matchAll(IMPORT)) {
        const name = match[1];
        if (declaredForDevelopmentOnly.has(name) && !provided.has(name)) {
          found.push({ file, package: name });
        }
      }
    }
  }
  return found;
}
