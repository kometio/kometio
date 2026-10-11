// What `HEALTHCHECK` runs (docs/adr/0101). It used to ask the API and nothing
// else, and the API is the one half that is up when the others are not: the site
// or the editor could be hung, or gone from under a Caddy that still answered,
// and Docker would say "healthy" while the thing people open did not.
//
// It asks each part on the port it has inside the container (`innerPorts`, the
// same table the launcher starts them from), all at once and each with its own
// limit, so that the whole answer comes within Docker's timeout. A part is well
// if it answers with anything under 500: the editor's `/` and Caddy's redirect
// are not a 200, and a healthy server with no page yet is not unwell.
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { innerPorts, resolveAddresses } from './server-mode.mjs';

const EACH_MS = 4000;

/** What to look at, for an installation started with `env`. */
export function targetsFor(env) {
  const ports = innerPorts(resolveAddresses(env).domain);
  return [
    { name: 'the API', url: `http://127.0.0.1:${ports.api}/api/health` },
    { name: 'the site', url: `http://127.0.0.1:${ports.site}/api/health` },
    { name: 'the editor', url: `http://127.0.0.1:${ports.editor}/` },
    ...(ports.proxy === null
      ? []
      : [{ name: 'Caddy', url: `http://127.0.0.1:${ports.proxy}/` }]),
  ];
}

const answers = ({ url }) =>
  new Promise((resolve) => {
    const request = get(url, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    });
    request.setTimeout(EACH_MS, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });

/** The names of the parts that do not answer; empty when all do. */
export async function notAnswering(env, targets = targetsFor(env)) {
  const results = await Promise.all(targets.map(answers));
  return targets.filter((_, index) => !results[index]).map(({ name }) => name);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed;
  try {
    failed = await notAnswering(process.env);
  } catch (error) {
    failed = [error.message];
  }
  if (failed.length > 0) {
    console.error(`not answering: ${failed.join(', ')}`);
    process.exit(1);
  }
}
