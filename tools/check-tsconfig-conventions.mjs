#!/usr/bin/env node
/**
 * Every project's tsconfig must inherit the workspace's module
 * resolution instead of restating it.
 *
 * `tsconfig.base.json` sets `module: esnext` and `moduleResolution:
 * bundler`, and the repo's relative imports are written without a `.js`
 * extension because of it (PR #107/#108 stripped them from 585 files).
 * `nx g @nx/js:library` writes `module: nodenext` /
 * `moduleResolution: nodenext` into the tsconfigs it generates — there
 * is no flag to stop it — and under nodenext an extensionless relative
 * import does not resolve at all.
 *
 * What that produces is `error TS2307: Cannot find module
 * './lib/whatever'` on a file that is plainly sitting right there, which
 * reads like anything except a tsconfig problem. Hence this check: the
 * failure is cheap to fix and expensive to diagnose, and the difference
 * between the two is a message.
 */
import { globSync, readFileSync } from 'node:fs';

const OVERRIDES_TO_REFUSE = ['module', 'moduleResolution'];

const files = globSync('{apps,libs,themes}/**/tsconfig*.json', {
  exclude: (path) => path.includes('node_modules') || path.includes('dist'),
});

const offenders = [];
for (const file of files) {
  let parsed;
  try {
    // Comments are legal in a tsconfig and JSON.parse chokes on them —
    // stripped rather than pulling in a JSON5 dependency for one check.
    const raw = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    parsed = JSON.parse(raw);
  } catch {
    // A tsconfig this cannot read is not this check's business to
    // report: tsc itself will say so, and more precisely.
    continue;
  }
  const compilerOptions = parsed.compilerOptions ?? {};
  const found = OVERRIDES_TO_REFUSE.filter((key) => key in compilerOptions);
  if (found.length > 0) {
    offenders.push({ file, found });
  }
}

if (offenders.length > 0) {
  console.error(
    '\ntsconfig convention: these files override the workspace module resolution.\n' +
      'Delete the listed keys — tsconfig.base.json already sets\n' +
      '`module: esnext` and `moduleResolution: bundler`, and relative imports\n' +
      'in this repo have no file extension, which nodenext refuses to resolve.\n',
  );
  for (const { file, found } of offenders) {
    console.error(`  ${file} — ${found.join(', ')}`);
  }
  console.error(
    '\n(`nx g @nx/js:library` writes them by default. There is no flag: remove them by hand.)\n',
  );
  process.exit(1);
}

console.log(`tsconfig convention: ${files.length} files checked, all clean.`);
