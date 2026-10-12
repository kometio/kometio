// `pnpm audit --prod` is what blocks a pull request (ci.yml, job `audit`):
// the `dependencies` of every project, taken to be what ships. That holds
// only while nothing that ships is declared as a `devDependency`. A library
// that is imported by a project's source and named only among its
// `devDependencies` would be bundled into an image or the editor's bundle
// and never audited by the blocking job.
//
// This is the check that makes the narrowing safe: it fails naming the
// import. It reads every workspace project's `package.json` and its source
// files that are not tests, configuration, scripts or fixtures.
//
//   node tools/check-runtime-dependencies.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Source files that do not ship: tests, their setup and fixtures, tool configuration, scripts. */
const NOT_SHIPPED =
  /(\.spec\.|\.test\.|\.test-fixture\.|\/test-setup\.|\/jest\.setup\.|vitest\.config|playwright|\/e2e\/|\/tests?\/|eslint\.config|\/scripts\/|\.config\.)/;

const SOURCE = /\.(ts|tsx|mjs|js|astro)$/;

const IMPORT =
  /(?:from|import)\s*\(?\s*['"]((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:\/[^'"]*)?['"]/gi;

/**
 * A theme is compiled into the public site, which provides `astro` to it:
 * it names it as a dev dependency to be able to type-check on its own.
 */
const PROVIDED = { themes: new Set(['astro']) };

/**
 * @param {{ directory: string, packageJson: object, files: Record<string, string> }[]} projects
 * @returns {{ file: string, package: string }[]}
 */
export function violations(projects) {
  const found = [];
  for (const { directory, packageJson, files } of projects) {
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
      if (!SOURCE.test(file) || NOT_SHIPPED.test(file)) continue;
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

function workspaceProjects() {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return tracked
    .filter((file) => file.endsWith('/package.json'))
    .map((manifest) => {
      const directory = dirname(manifest);
      const prefix = `${directory}/`;
      const files = {};
      for (const file of tracked) {
        if (file.startsWith(prefix) && SOURCE.test(file)) {
          files[file] = readFileSync(file, 'utf8');
        }
      }
      return {
        directory,
        packageJson: JSON.parse(readFileSync(manifest, 'utf8')),
        files,
      };
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = violations(workspaceProjects());
  for (const { file, package: name } of found) {
    console.error(`${file} imports ${name}, which is only a devDependency`);
  }
  if (found.length > 0) {
    console.error(
      '\nA library the code imports belongs in `dependencies`, or `pnpm audit --prod` does not look at it.',
    );
    process.exit(1);
  }
  console.log('Every library a project imports is one it ships with.');
}
