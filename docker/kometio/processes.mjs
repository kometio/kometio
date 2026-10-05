// What the launcher and the archive commands both need to run programs inside
// this container: as another user, one after another, and waiting for them.
// Nothing here knows what Kometio is.
import { spawnSync } from 'node:child_process';
import { chmodSync, chownSync, mkdirSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

export const log = (message) => console.log(`[kometio] ${message}`);

/** `quiet` keeps the output of the steps that succeed out of the log: a command that writes an archive has little to say, and what it says should be heard. */
export const output = { quiet: false };

/** An environment for a process that runs as another user: nothing of root's. */
export const minimalEnv = {
  PATH: process.env.PATH,
  HOME: '/tmp',
  LANG: 'C.UTF-8',
};

/** Drops what is `undefined`, which a child process would otherwise receive as the text "undefined". */
export const defined = (values) =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );

export function ids(user) {
  const line = readFileSync('/etc/passwd', 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${user}:`));
  if (!line) throw new Error(`no such user: ${user}`);
  const [, , uid, gid] = line.split(':');
  return { uid: Number(uid), gid: Number(gid) };
}

/** Creates a directory owned by `user` the first time; always keeps owner and mode. */
export function ensureDir(path, user, mode) {
  const { uid, gid } = ids(user);
  mkdirSync(path, { recursive: true });
  chownSync(path, uid, gid);
  chmodSync(path, mode);
}

/** A step that must finish before the next one starts. Its output is the log's, line by line. */
export function once(
  name,
  command,
  args,
  { user, childEnv = minimalEnv, cwd, input } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env: defined(childEnv),
    input,
    encoding: 'utf8',
    ...(user ? ids(user) : {}),
  });
  if (!output.quiet || result.status !== 0) {
    for (const line of `${result.stdout ?? ''}${result.stderr ?? ''}`.split(
      '\n',
    )) {
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  }
  if (result.status !== 0)
    throw new Error(`${name} failed (exit ${result.status})`);
}

/** Polls `probe` once a second for up to `seconds`; `shouldStop` lets a caller that is shutting down give up quietly. */
export async function waitFor(label, probe, seconds, shouldStop = () => false) {
  for (let waited = 0; waited < seconds; waited += 1) {
    if (shouldStop()) return;
    if (await probe()) return;
    await sleep(1000);
  }
  throw new Error(`${label} did not come up within ${seconds}s`);
}
