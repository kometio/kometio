// Production entrypoint — run this after `astro build`, NOT
// `dist/server/entry.mjs` directly (astro.config.mjs sets adapter mode to
// 'middleware', which only exports a request handler and does not start a
// server or serve static files on its own).
//
// Why this file exists at all: the canvas editor's live-preview iframe
// (apps/editor-app/src/app/canvas/canvas-frame.tsx) is sandboxed WITHOUT
// allow-same-origin (a deliberate fix against stored XSS via untrusted
// user-inserted blocks), which gives it an opaque origin. Every
// `type="module"` script/CSS request it makes — even to this same host —
// therefore requires a CORS check. In production those are the static
// bundles under `_astro/`; @astrojs/node's 'standalone' mode serves those
// via its own static file server BEFORE any Astro middleware ever sees the
// request, so there is no way to attach the header from within Astro
// itself. Serving those files ourselves, here, is the only choke point
// that can add it.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sirv from 'sirv';
import { buildCompatibility } from './build-compatibility.mjs';
import { handler as astroHandler } from './dist/server/entry.mjs';

const ASSETS_PREFIX = '/_astro/';

/** The build this image was made with — what it serves until a theme builder publishes one. */
const bundled = {
  id: 'bundled',
  handler: astroHandler,
  assets: sirv('dist/client', { dev: false }),
};
let active = bundled;

/*
 * Uploaded themes (docs/adr/0091). A theme is compiled into the site, so
 * uploading one means a new build of the whole site: the theme builder
 * makes it in THEME_DATA_DIR and names it in `current.json`. This server
 * loads that build beside its own and sends every new request to it — no
 * restart, and a request already running finishes on the build it began
 * on. It keeps serving what it has whenever the published build cannot be
 * used: no file yet, a build made for other packages, a build that fails
 * to load.
 */
const buildsDir = process.env.THEME_DATA_DIR;
const compatibility = buildsDir ? buildCompatibility('.') : null;
/** A build is named after the upload it was made for: a UUID. */
const BUILD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The last build refused, so its warning is written once rather than every two seconds. */
let refusedBuild = null;

async function loadPublishedBuild() {
  let published;
  try {
    published = JSON.parse(
      await readFile(join(buildsDir, 'current.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (published.build === active.id) return;
  // An upload's id, and nothing else, before it becomes part of a path.
  if (!BUILD_ID.test(published.build)) {
    console.warn(
      `current.json names a build that is not an upload id; still serving ${active.id}.`,
    );
    return;
  }
  if (published.compatibility !== compatibility) {
    if (published.build !== refusedBuild) {
      refusedBuild = published.build;
      console.warn(
        `Theme build ${published.build} was made for other packages than this server's; still serving ${active.id}. Run the theme builder of the same Kometio version as this site.`,
      );
    }
    return;
  }
  const dist = join(buildsDir, 'builds', published.build, 'dist');
  const { handler } = await import(
    pathToFileURL(join(dist, 'server', 'entry.mjs')).href
  );
  active = {
    id: published.build,
    handler,
    assets: sirv(join(dist, 'client'), { dev: false }),
  };
  console.log(`Serving theme build ${published.build}.`);
}

if (buildsDir) {
  const check = () =>
    loadPublishedBuild().catch((error) =>
      console.error('Could not load the published theme build:', error),
    );
  await check();
  setInterval(check, 2000).unref();
}

const server = createServer((req, res) => {
  if (req.url?.startsWith(ASSETS_PREFIX)) {
    // These are public, tenant-agnostic asset bundles (no user/tenant data
    // ever ends up in them), so a wildcard is safe here. Never reflect the
    // sandboxed iframe's `Origin: null` back as the allowed origin instead
    // — that's a known anti-pattern that would let ANY sandboxed iframe on
    // the internet read the response too, not just ours.
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  // Read once: a swap in the middle of a request must not split it
  // between two builds.
  const build = active;
  build.assets(req, res, () => build.handler(req, res));
});

// PUBLIC_SITE_PORT (not the bare PORT every other local app already reads
// from the same root .env — apps/api defaults to it too, see
// apps/api/src/main.ts) is checked first so this can have its own stable
// local port (4322, see docs/development.md) without stealing apps/api's.
// A real deployment still only ever sets plain PORT, which stays the
// fallback here.
const port = Number(process.env.PUBLIC_SITE_PORT ?? process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host);
