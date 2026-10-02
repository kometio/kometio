#!/usr/bin/env node
/**
 * Builds apps/public-site with a theme that does not live in this
 * repository (docs/adr/0089).
 *
 * Runs inside the `kometio-public-site-builder` image, after the theme's own
 * repository has been copied to `themes/<name>/`:
 *
 *   node tools/build-public-site-with-theme.mjs <name>
 *
 * The theme gets exactly the packages the public site itself ships with,
 * linked into `themes/node_modules` — nothing is installed. So a theme
 * cannot import something the running site would not have, and building
 * one needs no network and never touches the lockfile.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { buildCompatibility } from '../apps/public-site/build-compatibility.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const THEMES = join(ROOT, 'themes');
const PUBLIC_SITE = join(ROOT, 'apps/public-site');
/** Written when the builder image is made: the themes Kometio ships itself. */
const CORE_THEMES_FILE = join(ROOT, '.kometio-core-themes');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const name = process.argv[2];
if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  fail(
    'Name the theme: node tools/build-public-site-with-theme.mjs <name>, ' +
      'where <name> is its directory under themes/ — lowercase letters, ' +
      'digits and dashes. It is also the name sites choose it by.',
  );
}

const coreThemes = existsSync(CORE_THEMES_FILE)
  ? readFileSync(CORE_THEMES_FILE, 'utf8').split('\n').filter(Boolean)
  : [];
if (coreThemes.includes(name)) {
  fail(
    `"${name}" is one of Kometio's own themes (${coreThemes.join(', ')}). ` +
      'Copying yours over it would replace it for every site; give yours a name of its own.',
  );
}

const themeDir = join(THEMES, name);
for (const file of ['theme.json', 'theme.css']) {
  if (!existsSync(join(themeDir, file))) {
    fail(
      `themes/${name}/${file} is missing. A theme needs at least theme.json ` +
        'and theme.css (docs/creating-a-theme.md, "The smallest theme that works").',
    );
  }
}
try {
  JSON.parse(readFileSync(join(themeDir, 'theme.json'), 'utf8'));
} catch (error) {
  fail(`themes/${name}/theme.json is not valid JSON: ${error.message}`);
}

// What a theme may import: the public site's own dependencies, which are
// also what its running image carries.
const publicSitePackage = JSON.parse(
  readFileSync(join(PUBLIC_SITE, 'package.json'), 'utf8'),
);
const allowed = new Set(Object.keys(publicSitePackage.dependencies ?? {}));

const themePackageFile = join(themeDir, 'package.json');
if (existsSync(themePackageFile)) {
  const themePackage = JSON.parse(readFileSync(themePackageFile, 'utf8'));
  const extra = Object.keys(themePackage.dependencies ?? {}).filter(
    (dependency) => !allowed.has(dependency),
  );
  if (extra.length > 0) {
    fail(
      `themes/${name} depends on ${extra.join(', ')}, which the public site ` +
        'does not ship. A theme can import only what the site itself has:\n  ' +
        [...allowed].sort().join('\n  '),
    );
  }
}

// A node_modules copied in from the theme's own repository would win over
// the site's packages and bring a second, possibly different, copy of them.
const ownModules = join(themeDir, 'node_modules');
if (existsSync(ownModules)) {
  console.warn(
    `! Removing themes/${name}/node_modules: the site's own packages are used ` +
      'instead. Add node_modules to your .dockerignore to skip this.',
  );
  rmSync(ownModules, { recursive: true, force: true });
}

// Links every top-level package of the public site (scoped ones one level
// down) into themes/node_modules, where a theme's imports resolve.
const siteModules = join(PUBLIC_SITE, 'node_modules');
const shared = join(THEMES, 'node_modules');
mkdirSync(shared, { recursive: true });
function link(entry) {
  const target = join(siteModules, entry);
  const path = join(shared, entry);
  if (
    existsSync(path) ||
    lstatSync(target, { throwIfNoEntry: false }) === undefined
  ) {
    return;
  }
  symlinkSync(relative(join(path, '..'), target), path);
}
for (const entry of readdirSync(siteModules)) {
  if (entry.startsWith('.')) continue;
  if (entry.startsWith('@')) {
    mkdirSync(join(shared, entry), { recursive: true });
    for (const scoped of readdirSync(join(siteModules, entry))) {
      link(join(entry, scoped));
    }
  } else {
    link(entry);
  }
}

console.log(`Building the public site with themes/${name} …`);
try {
  // Astro itself, not `nx run @kometio/public-site:build`, which runs the
  // same `astro build`: Nx needs a writable cache for its native module,
  // and an uploaded theme is built with nothing writable but a scratch
  // directory (docs/adr/0091).
  execFileSync('pnpm', ['exec', 'astro', 'build'], {
    cwd: PUBLIC_SITE,
    stdio: 'inherit',
  });
} catch {
  // The build has already printed why; a stack trace of this script would
  // only push that off the end of the log the editor shows.
  fail(
    `The site did not build with themes/${name}: the build's own output above says why.`,
  );
}
// The packages this build was made against, carried with it: a site that
// loads it from elsewhere (an uploaded theme, docs/adr/0091) compares it
// with its own before running it.
writeFileSync(
  join(PUBLIC_SITE, 'dist', 'compatibility'),
  buildCompatibility(PUBLIC_SITE),
);
console.log(
  `\n✔ Built. apps/public-site/dist now carries themes/${name} alongside ` +
    `Kometio's own (${coreThemes.join(', ') || 'none recorded'}).`,
);
