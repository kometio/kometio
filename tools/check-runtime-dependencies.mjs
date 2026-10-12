// Fails when a project's source imports a library that is declared only as
// a `devDependency`: the narrowing of the blocking audit to `--prod` is
// sound only while that never happens (tools/runtime-dependency-violations.mjs
// says what counts, and why).
//
//   node tools/check-runtime-dependencies.mjs [repository-root]
//
// The repository is the one this file is in unless a root is given. A check
// that found nothing to look at has not passed, so it fails.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { violations } from './runtime-dependency-violations.mjs';

const SOURCE = /\.(ts|tsx|mjs|js|astro)$/;

const root = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'),
);

function workspaceProjects() {
  // `-z`: a path is whatever bytes a file is called, newlines included.
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  return tracked
    .filter((file) => file.endsWith('/package.json'))
    .map((manifest) => {
      const directory = dirname(manifest);
      const prefix = `${directory}/`;
      const files = {};
      for (const file of tracked) {
        if (file.startsWith(prefix) && SOURCE.test(file)) {
          files[file] = readFileSync(join(root, file), 'utf8');
        }
      }
      return {
        directory,
        packageJson: JSON.parse(readFileSync(join(root, manifest), 'utf8')),
        files,
      };
    });
}

const projects = workspaceProjects();
if (projects.length === 0) {
  console.error(
    `No project found under ${root}: nothing was checked, which is not the same as nothing being wrong.`,
  );
  process.exit(1);
}

const found = violations(projects);
for (const { file, package: name } of found) {
  console.error(`${file} imports ${name}, which is only a devDependency`);
}
if (found.length > 0) {
  console.error(
    '\nA library the code imports belongs in `dependencies`, or `pnpm audit --prod` does not look at it.',
  );
  process.exit(1);
}
console.log(
  `Every library the ${projects.length} projects import is one they ship with.`,
);
