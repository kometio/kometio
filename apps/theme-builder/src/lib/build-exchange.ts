import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  chmod,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { z } from 'zod';
import type { BuildRequest } from './theme-builder';

/*
 * How the publisher and the runner hand a build to each other
 * (docs/adr/0091). They share one directory and nothing else:
 *
 *   job/themes/<name>/   the themes to build with (publisher)
 *   job/request.json     { id, name } — written last (publisher)
 *   job/build.log        the build's output (runner)
 *   job/dist/            the built site (runner)
 *   job/result.json      { id, ok } — written last (runner)
 *
 * Everything the runner writes was produced by a theme's code, so the
 * publisher reads it as untrusted: the id has to match, only the end of the
 * log is read, and links in `dist` are left out when it is published.
 */

const requestSchema = z.object({ id: z.string(), name: z.string() });
const resultSchema = z.object({ id: z.string(), ok: z.boolean() });

/** The most of a build log the publisher reads: its end is what says what broke. */
const LOG_READ_BYTES = 256 * 1024;

function jobPaths(exchange: string) {
  const job = join(exchange, 'job');
  return {
    job,
    themes: join(job, 'themes'),
    request: join(job, 'request.json'),
    log: join(job, 'build.log'),
    dist: join(job, 'dist'),
    result: join(job, 'result.json'),
  };
}

async function writeAtomically(path: string, content: string) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The publisher's side: hands the build over, waits for its result, and
 * copies the end of its log to `log`. The built site's `dist` in the
 * exchange directory, or null.
 */
export async function requestBuild(
  exchange: string,
  id: string,
  request: BuildRequest,
  log: string,
  options: { timeoutMs: number; pollMs: number },
): Promise<string | null> {
  const paths = jobPaths(exchange);
  await rm(paths.job, { recursive: true, force: true });
  await mkdir(paths.themes, { recursive: true });
  for (const [name, source] of request.themes) {
    await cp(source, join(paths.themes, name), { recursive: true });
  }
  // The runner is another, unprivileged user: it writes its output here.
  await chmod(paths.job, 0o777);
  await writeAtomically(
    paths.request,
    JSON.stringify({ id, name: request.name }),
  );

  const deadline = Date.now() + options.timeoutMs;
  let ok: boolean | null = null;
  while (ok === null && Date.now() < deadline) {
    const result = resultSchema.safeParse(await readJson(paths.result));
    if (result.success && result.data.id === id) ok = result.data.ok;
    else await sleep(options.pollMs);
  }
  await copyLogTail(paths.log, log, ok === null);
  return ok ? paths.dist : null;
}

async function copyLogTail(source: string, target: string, timedOut: boolean) {
  let tail = '';
  const file = await open(source, 'r').catch(() => null);
  if (file) {
    try {
      const { size } = await file.stat();
      const length = Math.min(size, LOG_READ_BYTES);
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, size - length);
      tail = buffer.toString('utf8');
    } finally {
      await file.close();
    }
  }
  if (timedOut) tail += '\nThe build did not finish in time.\n';
  await writeFile(target, tail);
}

/**
 * The runner's side: builds the one job waiting, if there is one, and
 * returns whether there was. The runner process exits after it — its
 * container starts again clean, with nothing a theme left running.
 */
export async function runRequestedBuild(options: {
  exchange: string;
  /** The Kometio workspace, read-only: copied, never written. */
  workspace: string;
  /** Where the copy is made and thrown away. */
  scratch: string;
  timeoutMs: number;
}): Promise<boolean> {
  const paths = jobPaths(options.exchange);
  const request = requestSchema.safeParse(await readJson(paths.request));
  if (!request.success) return false;
  if (resultSchema.safeParse(await readJson(paths.result)).success) {
    return false;
  }

  const workspace = join(options.scratch, 'workspace');
  await rm(workspace, { recursive: true, force: true });
  let ok = false;
  try {
    await copyWorkspace(options.workspace, workspace);
    for (const name of await readdir(paths.themes)) {
      await cp(join(paths.themes, name), join(workspace, 'themes', name), {
        recursive: true,
      });
    }
    ok = await buildSite(
      workspace,
      request.data.name,
      paths.log,
      options.timeoutMs,
    );
    if (ok) {
      await cp(join(workspace, 'apps', 'public-site', 'dist'), paths.dist, {
        recursive: true,
      });
    }
  } finally {
    await writeAtomically(
      paths.result,
      JSON.stringify({ id: request.data.id, ok }),
    );
    await rm(workspace, { recursive: true, force: true });
  }
  return true;
}

function buildSite(
  workspace: string,
  name: string,
  log: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((done) => {
    const output = createWriteStream(log, { flags: 'a' });
    const child = spawn(
      'node',
      ['tools/build-public-site-with-theme.mjs', name],
      {
        cwd: workspace,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Plain text: the log ends up in the editor.
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
    );
    child.stdout.pipe(output);
    child.stderr.pipe(output);
    const timer = setTimeout(() => {
      output.write(`\nStopped after ${timeoutMs / 60000} minutes.\n`);
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      output.end(() => done(code === 0));
    });
  });
}

/**
 * A copy of the workspace to build in: its files copied, and each
 * `node_modules` a new directory of links to the packages it held — so a
 * build can write its caches beside them, while the packages themselves
 * stay the read-only originals. A theme cannot leave anything behind for
 * the next build.
 */
export async function copyWorkspace(source: string, target: string) {
  await cp(source, target, {
    recursive: true,
    filter: (path) => basename(path) !== 'node_modules',
  });
  for (const modules of await findNodeModules(source)) {
    await mirrorDirectory(modules, join(target, relative(source, modules)));
  }
}

async function findNodeModules(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    if (entry.name === 'node_modules') found.push(path);
    else found.push(...(await findNodeModules(path)));
  }
  return found;
}

/** Links to every entry of `source`, one level into a scope (`@nestjs/…`) the way packages are laid out. */
async function mirrorDirectory(source: string, target: string) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const path = join(source, entry.name);
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      await mirrorDirectory(path, join(target, entry.name));
    } else {
      await symlink(await realpath(path), join(target, entry.name));
    }
  }
}
