// The long-running processes of the container, living and dying together.
//
// Nothing here knows what Kometio is: a process is started under a name, and
// stopping it, or its dying, is handled in one place.
//
//   - one that stops on its own takes the others down, and the launcher exits,
//     so that Docker's restart policy brings the whole thing back clean rather
//     than leaving half of it running;
//   - one that is stopped on purpose (opening an archive stops the API and the
//     site and starts them again) does not;
//   - everything is stopped in the reverse order it was started, each given its
//     own signal and the same time to leave before it is killed.
//
// What it needs of the machine is handed in, so that a test can give it a
// child that does what it is told: `spawn`, `identify` (a user's uid and gid),
// `sleep`, `say` (the launcher's own log line), `print` (a line of a child's
// output), `format` (how that line is written) and `exit`.
import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { formatLine } from './log-format.mjs';
import { defined, ids, log, minimalEnv, output } from './processes.mjs';

/**
 * @typedef {object} Entry
 * @property {string} name
 * @property {import('node:child_process').ChildProcess} child
 * @property {NodeJS.Signals} stop      the signal that stops it politely
 * @property {boolean} expectedToStop   stopped on purpose: its exit is no reason to stop the others
 */

export class ProcessSupervisor {
  /** @type {Entry[]} */
  #running = [];
  #stopping = false;
  #spawn;
  #identify;
  #sleep;
  #say;
  #print;
  #format;
  #exit;
  #graceMs;

  constructor({
    spawn = nodeSpawn,
    identify = ids,
    sleep = delay,
    say = log,
    print = console.log,
    format = (name, line, stream) =>
      formatLine(output.format, name, line, { stream }),
    exit = (code) => process.exit(code),
    graceMs = 30_000,
  } = {}) {
    this.#spawn = spawn;
    this.#identify = identify;
    this.#sleep = sleep;
    this.#say = say;
    this.#print = print;
    this.#format = format;
    this.#exit = exit;
    this.#graceMs = graceMs;
  }

  /** True once the launcher is stopping: what a wait for something to come up gives up on. */
  get stopping() {
    return this.#stopping;
  }

  /** The names of what is running, in the order it was started. */
  get names() {
    return this.#running.map((entry) => entry.name);
  }

  /**
   * Starts a process that is meant to run for as long as the launcher does.
   * `stop` is the signal that stops it politely (Postgres's "fast" shutdown is
   * SIGINT); `onLine` sees each line it writes, as the launcher prints it.
   */
  start(
    name,
    command,
    args,
    { user, childEnv = minimalEnv, cwd, stop = 'SIGTERM', onLine } = {},
  ) {
    const child = this.#spawn(command, args, {
      cwd,
      env: defined(childEnv),
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(user ? this.#identify(user) : {}),
    });
    /** @type {Entry} */
    const entry = { name, child, stop, expectedToStop: false };
    this.#relay(child.stdout, name, 'stdout', onLine);
    this.#relay(child.stderr, name, 'stderr', onLine);
    child.on('exit', (code, signal) => {
      if (this.#stopping || entry.expectedToStop) return;
      this.#say(
        `${name} stopped on its own (${signal ?? `exit ${code}`}): stopping everything`,
      );
      void this.shutdown(1);
    });
    this.#running.push(entry);
    return child;
  }

  /** Stops one process on purpose, and takes it off the list of what is running. */
  async stopOne(name) {
    const entry = this.#running.find((candidate) => candidate.name === name);
    if (!entry) return;
    entry.expectedToStop = true;
    await this.#terminate(entry);
    this.#running.splice(this.#running.indexOf(entry), 1);
  }

  /** Stops everything, last started first, and exits with `code`. Once: a second call is the first one still going. */
  async shutdown(code) {
    if (this.#stopping) return;
    this.#stopping = true;
    this.#say('stopping');
    for (const entry of [...this.#running].reverse()) {
      await this.#terminate(entry);
    }
    this.#exit(code);
  }

  /** Its signal, then the time to leave, then SIGKILL: the same for every way a process is stopped. */
  async #terminate({ name, child, stop }) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    // Listening before the signal, so that an exit it provokes cannot be missed.
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill(stop);
    const gaveUp = this.#sleep(this.#graceMs).then(() => 'timeout');
    if ((await Promise.race([exited, gaveUp])) === 'timeout') {
      this.#say(`${name} did not stop in time: killing it`);
      child.kill('SIGKILL');
      await exited;
    }
  }

  #relay(stream, name, streamName, onLine) {
    createInterface({ input: stream }).on('line', (line) => {
      this.#print(this.#format(name, line, streamName));
      onLine?.(line);
    });
  }
}
