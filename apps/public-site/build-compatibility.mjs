// Whether a site build made elsewhere can run on this server's packages
// (docs/adr/0091). Shared by the theme builder, which stamps every build it
// publishes, and server.mjs, which refuses a build whose stamp is not its
// own.
//
// A published build brings its own compiled code but not its packages: it
// runs on the node_modules of the server that loads it. So what has to
// match is the exact INSTALLED version of every package the site depends
// on — not the ranges in package.json, which two releases can share while
// resolving differently, and which `pnpm deploy` rewrites anyway. Kometio's
// own libraries are compiled into the build and are not part of it.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A digest of the installed version of every package the site at `siteDir` depends on. */
export function buildCompatibility(siteDir) {
  const manifest = JSON.parse(
    readFileSync(join(siteDir, 'package.json'), 'utf8'),
  );
  const installed = Object.keys(manifest.dependencies ?? {})
    .filter((name) => !name.startsWith('@kometio/'))
    .sort()
    .map((name) => {
      // Read directly rather than through `require.resolve`: some packages
      // (simple-icons) do not export their package.json.
      const own = JSON.parse(
        readFileSync(
          join(siteDir, 'node_modules', name, 'package.json'),
          'utf8',
        ),
      );
      return `${name}@${own.version}`;
    });
  return createHash('sha256').update(installed.join('\n')).digest('hex');
}
