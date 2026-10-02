/** One dispatched event: its name (`message` when the stream gave none) and its data. */
export interface ServerSentEvent {
  event: string;
  data: string;
}

/**
 * The events in a `text/event-stream` body, read the way a browser's
 * EventSource reads them (WHATWG HTML, "Parsing an event stream").
 *
 * The server writes one strict shape today, and the parser this replaces
 * read only that shape: a proxy that rewrote line endings to `\r\n`
 * stopped every event, a `data:` with no space after the colon was
 * dropped, and several `data:` lines were run together without their
 * line breaks. What the specification allows is what is read here:
 * `\r\n`, `\r` or `\n` line endings; `field:value` with an optional
 * space; `data` lines joined with `\n`; `:` comment lines ignored; an
 * event dispatched on a blank line and, as in a browser, a half-written
 * last event discarded when the stream ends.
 */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let pending = '';
  let event = '';
  let data: string[] = [];

  function* take(text: string, final: boolean): Generator<ServerSentEvent> {
    pending += text;
    // A `\r` at the very end may be the first half of `\r\n`: it waits for
    // the next chunk to say which, unless there is no next chunk.
    let held = '';
    if (!final && pending.endsWith('\r')) {
      held = '\r';
      pending = pending.slice(0, -1);
    }
    const lines = pending.split(/\r\n|\r|\n/);
    pending = (lines.pop() ?? '') + held;
    for (const line of lines) {
      if (line === '') {
        if (data.length > 0) {
          yield { event: event || 'message', data: data.join('\n') };
        }
        event = '';
        data = [];
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
  }

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      // The decoder may hold the start of a character split across the
      // last two chunks.
      yield* take(decoder.decode(), true);
      return;
    }
    yield* take(decoder.decode(value, { stream: true }), false);
  }
}
