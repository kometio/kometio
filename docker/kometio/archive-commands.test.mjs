import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, it } from 'node:test';
import { Refusal } from './archive.mjs';
import { limitedBytes } from './archive-commands.mjs';

const sink = () =>
  new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

describe('limitedBytes: a body is not written to the disk without end', () => {
  it('passes what is within the limit', async () => {
    await pipeline(
      Readable.from([Buffer.alloc(40), Buffer.alloc(60)]),
      limitedBytes(100, 'too big'),
      sink(),
    );
  });

  it('fails with a refusal, in the words it was given, at the byte after the limit', async () => {
    await assert.rejects(
      pipeline(
        Readable.from([Buffer.alloc(60), Buffer.alloc(41)]),
        limitedBytes(100, 'too big for this volume'),
        sink(),
      ),
      (error) =>
        error instanceof Refusal && error.message === 'too big for this volume',
    );
  });

  it('stops reading the sender: what comes after the limit is never asked for', async () => {
    let produced = 0;
    const endless = new Readable({
      read() {
        produced += 1;
        this.push(Buffer.alloc(1024));
      },
    });

    await assert.rejects(
      pipeline(endless, limitedBytes(10 * 1024, 'no'), sink()),
      Refusal,
    );
    assert.ok(
      produced < 100,
      `${produced} chunks were read from an endless body`,
    );
  });
});
