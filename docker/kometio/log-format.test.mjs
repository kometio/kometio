import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatLine, logFormatOf, messageLines } from './log-format.mjs';

const at = { now: () => 1791881127287 };

describe('the format the environment asks for', () => {
  it('is text when nothing is said, or an empty value', () => {
    assert.equal(logFormatOf({}), 'text');
    assert.equal(logFormatOf({ KOMETIO_LOG_FORMAT: '' }), 'text');
    assert.equal(logFormatOf({ KOMETIO_LOG_FORMAT: '  ' }), 'text');
  });

  it('is json when it says so', () => {
    assert.equal(logFormatOf({ KOMETIO_LOG_FORMAT: 'json' }), 'json');
  });

  it('refuses a value that is neither, and says what it may be', () => {
    assert.throws(
      () => logFormatOf({ KOMETIO_LOG_FORMAT: 'ndjson' }),
      /has to be "text" or "json" \(it is "ndjson"\)/,
    );
  });
});

describe('a line of the log', () => {
  it('is, in text, the line behind the name of the part, as it always was', () => {
    assert.equal(
      formatLine('text', 'api', 'listening on 3000'),
      '[api] listening on 3000',
    );
    assert.equal(
      formatLine('text', 'api', '{"level":"log","message":"x"}'),
      '[api] {"level":"log","message":"x"}',
    );
  });

  it('is, in json, a plain line wrapped with the part, the time and the stream', () => {
    const line = formatLine('json', 'postgres', 'database system is ready', {
      stream: 'stderr',
      ...at,
    });

    assert.deepEqual(JSON.parse(line), {
      service: 'postgres',
      level: 'log',
      timestamp: 1791881127287,
      stream: 'stderr',
      message: 'database system is ready',
    });
  });

  it('is, in json, a line that already is an object kept as it is, with the part added', () => {
    const api =
      '{"level":"warn","pid":41,"timestamp":1791881127287,"message":"careful","context":"Setup"}';

    assert.deepEqual(JSON.parse(formatLine('json', 'api', api)), {
      service: 'api',
      level: 'warn',
      pid: 41,
      timestamp: 1791881127287,
      message: 'careful',
      context: 'Setup',
    });
  });

  it('keeps the part’s name as the launcher knows it, whatever the line says its own is', () => {
    assert.equal(
      JSON.parse(formatLine('json', 'caddy', '{"service":"other","msg":"x"}'))
        .service,
      'caddy',
    );
  });

  it('wraps what only looks like JSON: an array, a number, a broken object', () => {
    for (const text of ['[1,2]', '42', '{"unfinished":', '{not json}']) {
      const parsed = JSON.parse(formatLine('json', 'site', text, at));
      assert.equal(parsed.message, text, text);
      assert.equal(parsed.service, 'site');
    }
  });

  it('is always one line, whatever the text holds', () => {
    const line = formatLine(
      'json',
      'api',
      'a "quoted" \\ word\twith a tab',
      at,
    );

    assert.equal(line.includes('\n'), false);
    assert.equal(JSON.parse(line).message, 'a "quoted" \\ word\twith a tab');
  });
});

describe('what a line says, for the code that looks in it', () => {
  it('is the line itself in text', () => {
    assert.deepEqual(messageLines('      abcdefghijklmnopqrstuvwxyz'), [
      '      abcdefghijklmnopqrstuvwxyz',
    ]);
  });

  it('is the lines of the message when the line is a JSON object, as the API writes the setup token’s box', () => {
    const line = JSON.stringify({
      level: 'warn',
      message: 'Open the editor and enter this setup token:\n\n      TOKEN\n',
    });

    assert.deepEqual(messageLines(line), [
      'Open the editor and enter this setup token:',
      '',
      '      TOKEN',
      '',
    ]);
  });

  it('is the line when it is an object without a text message', () => {
    const line = '{"level":"log","message":{"a":1}}';

    assert.deepEqual(messageLines(line), [line]);
  });
});
