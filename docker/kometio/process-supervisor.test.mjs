import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { PassThrough } from 'node:stream';
import { ProcessSupervisor } from './process-supervisor.mjs';

/** A child process that does what the test says: leaves when signalled, or ignores everything but SIGKILL. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode = null;
  signalCode = null;
  signals = [];

  constructor(options) {
    super();
    this.options = options;
  }

  kill(signal) {
    this.signals.push(signal);
    const leaves = !this.stubborn || signal === 'SIGKILL';
    if (leaves) setImmediate(() => this.die(signal));
    return true;
  }

  die(signal) {
    this.signalCode = signal;
    this.emit('exit', null, signal);
  }

  crash(code) {
    this.exitCode = code;
    this.emit('exit', code, null);
  }
}

/** Time the test holds: a sleep ends when the test says so. */
function clock() {
  const sleeps = [];
  return {
    sleeps,
    sleep: (ms) =>
      new Promise((resolve) => {
        sleeps.push({ ms, resolve });
      }),
    /** The grace period of the oldest sleep that is still waiting runs out. */
    expire: () => sleeps.shift().resolve(),
  };
}

function setup(options = {}) {
  const time = clock();
  const said = [];
  const printed = [];
  const exits = [];
  const children = [];
  const supervisor = new ProcessSupervisor({
    spawn: (command, args, spawnOptions) => {
      const child = new FakeChild({ command, args, ...spawnOptions });
      children.push(child);
      return child;
    },
    identify: (user) => ({ uid: user.length, gid: user.length + 1000 }),
    sleep: time.sleep,
    say: (message) => said.push(message),
    print: (line) => printed.push(line),
    exit: (code) => exits.push(code),
    graceMs: 30_000,
    ...options,
  });
  return { supervisor, time, said, printed, exits, children };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Lets the event loop turn until `done()` is true, and fails rather than hang when it never is. */
async function until(done) {
  for (let turns = 0; turns < 100; turns += 1) {
    if (done()) return;
    await settle();
  }
  assert.fail('what the test waits for did not happen');
}

describe('starting a process', () => {
  it('runs it as the user it names, with the environment it is given and nothing undefined in it', () => {
    const { supervisor, children } = setup();

    supervisor.start('api', 'node', ['main.js'], {
      user: 'kometio',
      cwd: '/opt/api',
      childEnv: { A: '1', B: undefined },
    });

    const [child] = children;
    assert.equal(child.options.command, 'node');
    assert.deepEqual(child.options.args, ['main.js']);
    assert.equal(child.options.cwd, '/opt/api');
    assert.deepEqual(child.options.env, { A: '1' });
    assert.equal(child.options.uid, 'kometio'.length);
    assert.equal(child.options.gid, 'kometio'.length + 1000);
  });

  it('prints what it writes, a line at a time, under its name, and hands each line to its watcher', async () => {
    const { supervisor, children, printed } = setup();
    const seen = [];
    supervisor.start('api', 'node', [], { onLine: (line) => seen.push(line) });

    children[0].stdout.write('first\nsecond\n');
    children[0].stderr.write('an error\n');
    await settle();

    assert.deepEqual(printed.sort(), [
      '[api] an error',
      '[api] first',
      '[api] second',
    ]);
    assert.deepEqual(seen.sort(), ['an error', 'first', 'second']);
  });
});

describe('a process that stops on its own', () => {
  it('stops everything else, the last started first, and exits with 1', async () => {
    const { supervisor, children, said, exits } = setup();
    supervisor.start('postgres', 'postgres', [], { stop: 'SIGINT' });
    supervisor.start('api', 'node', []);
    supervisor.start('site', 'node', []);

    children[1].crash(3);
    await until(() => exits.length > 0);

    assert.match(said[0], /api stopped on its own \(exit 3\)/);
    assert.deepEqual(children[2].signals, ['SIGTERM']);
    assert.deepEqual(children[0].signals, ['SIGINT']);
    assert.deepEqual(exits, [1]);
  });

  it('is told by the signal when there was no exit code', async () => {
    const { supervisor, children, said } = setup();
    supervisor.start('site', 'node', []);

    children[0].die('SIGSEGV');
    await settle();

    assert.match(said[0], /site stopped on its own \(SIGSEGV\)/);
  });
});

describe('stopping one on purpose', () => {
  it('stops that one only, takes it off the list, and does not stop the others', async () => {
    const { supervisor, children, exits } = setup();
    supervisor.start('api', 'node', []);
    supervisor.start('site', 'node', []);

    await supervisor.stopOne('site');
    await settle();

    assert.deepEqual(children[1].signals, ['SIGTERM']);
    assert.deepEqual(children[0].signals, []);
    assert.deepEqual(supervisor.names, ['api']);
    assert.deepEqual(exits, []);
    assert.equal(supervisor.stopping, false);
  });

  it('lets the same name be started again', async () => {
    const { supervisor } = setup();
    supervisor.start('site', 'node', []);

    await supervisor.stopOne('site');
    supervisor.start('site', 'node', []);

    assert.deepEqual(supervisor.names, ['site']);
  });

  it('is nothing when no process has that name', async () => {
    const { supervisor } = setup();

    await supervisor.stopOne('nothing');

    assert.deepEqual(supervisor.names, []);
  });

  it('kills one that does not leave in time, and says so', async () => {
    const { supervisor, children, time, said } = setup();
    supervisor.start('site', 'node', []);
    children[0].stubborn = true;

    const stopped = supervisor.stopOne('site');
    await settle();
    assert.deepEqual(children[0].signals, ['SIGTERM']);
    assert.equal(time.sleeps[0].ms, 30_000);
    time.expire();
    await stopped;

    assert.deepEqual(children[0].signals, ['SIGTERM', 'SIGKILL']);
    assert.match(said.join('\n'), /site did not stop in time: killing it/);
    assert.deepEqual(supervisor.names, []);
  });
});

describe('stopping everything', () => {
  it('stops each in the reverse order of the start, with its own signal, then exits with the code', async () => {
    const { supervisor, children, exits } = setup();
    supervisor.start('postgres', 'postgres', [], { stop: 'SIGINT' });
    supervisor.start('api', 'node', []);
    supervisor.start('editor', 'nginx', []);
    const order = [];
    children.forEach((child, index) => {
      child.on('exit', () => order.push(['postgres', 'api', 'editor'][index]));
    });

    await supervisor.shutdown(0);

    assert.deepEqual(order, ['editor', 'api', 'postgres']);
    assert.deepEqual(children[0].signals, ['SIGINT']);
    assert.deepEqual(children[1].signals, ['SIGTERM']);
    assert.deepEqual(exits, [0]);
  });

  it('gives each the same time to leave as stopping one does, and waits for the kill to land', async () => {
    const { supervisor, children, time, exits } = setup();
    supervisor.start('api', 'node', []);
    children[0].stubborn = true;

    const done = supervisor.shutdown(0);
    await settle();
    assert.deepEqual(exits, []);
    time.expire();
    await done;

    assert.deepEqual(children[0].signals, ['SIGTERM', 'SIGKILL']);
    assert.deepEqual(exits, [0]);
  });

  it('is done once: asking again while it is going on changes nothing', async () => {
    const { supervisor, children, exits } = setup();
    supervisor.start('api', 'node', []);

    const first = supervisor.shutdown(0);
    await supervisor.shutdown(1);
    await first;

    assert.deepEqual(children[0].signals, ['SIGTERM']);
    assert.deepEqual(exits, [0]);
  });

  it('does not take a process leaving as a reason to stop the others a second time', async () => {
    const { supervisor, children, said } = setup();
    supervisor.start('api', 'node', []);
    supervisor.start('site', 'node', []);

    await supervisor.shutdown(0);

    assert.equal(
      said.filter((message) => message.includes('stopped on its own')).length,
      0,
    );
    assert.equal(children[0].signals.length, 1);
  });

  it('leaves alone one that has already left', async () => {
    const { supervisor, children, exits } = setup();
    supervisor.start('api', 'node', []);
    children[0].exitCode = 0;

    await supervisor.shutdown(0);

    assert.deepEqual(children[0].signals, []);
    assert.deepEqual(exits, [0]);
  });
});
