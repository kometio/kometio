import { describe, expect, it } from 'vitest';
import { readServerSentEvents } from './server-sent-events';

/** A body delivered in exactly these pieces, the way a network splits it. */
function body(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === 'string' ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });
}

async function events(stream: ReadableStream<Uint8Array>) {
  const all = [];
  for await (const event of readServerSentEvents(stream)) all.push(event);
  return all;
}

describe('readServerSentEvents', () => {
  it('reads the shape the server writes', async () => {
    expect(
      await events(body('event: progress\ndata: {"received":12}\n\n')),
    ).toEqual([{ event: 'progress', data: '{"received":12}' }]);
  });

  it('reads CRLF and lone CR line endings, as a proxy may rewrite them', async () => {
    expect(
      await events(body('event: a\r\ndata: 1\r\n\r\nevent: b\rdata: 2\r\r')),
    ).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ]);
  });

  it('keeps a CRLF split across two chunks as one line ending', async () => {
    expect(await events(body('data: x\r', '\n\r', '\n'))).toEqual([
      { event: 'message', data: 'x' },
    ]);
  });

  it('joins several data lines with line breaks, and takes data: without a space', async () => {
    expect(await events(body('event: done\ndata:{"a":\ndata: 1}\n\n'))).toEqual(
      [{ event: 'done', data: '{"a":\n1}' }],
    );
  });

  it('ignores comments and fields it does not know', async () => {
    expect(
      await events(body(': keep-alive\nid: 7\nretry: 10\ndata: ok\n\n')),
    ).toEqual([{ event: 'message', data: 'ok' }]);
  });

  it('puts an event split anywhere back together', async () => {
    expect(
      await events(
        body('eve', 'nt: progress\nda', 'ta: {"received"', ':3}\n', '\n'),
      ),
    ).toEqual([{ event: 'progress', data: '{"received":3}' }]);
  });

  it('keeps a character split between two chunks whole', async () => {
    const bytes = new TextEncoder().encode('data: perché\n\n');
    const cut = bytes.indexOf(0xc3) + 1;
    expect(await events(body(bytes.slice(0, cut), bytes.slice(cut)))).toEqual([
      { event: 'message', data: 'perché' },
    ]);
  });

  it('drops a last event the stream never finished, as a browser does', async () => {
    expect(await events(body('data: 1\n\ndata: half-written'))).toEqual([
      { event: 'message', data: '1' },
    ]);
  });
});
