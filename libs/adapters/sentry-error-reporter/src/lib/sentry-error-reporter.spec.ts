import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SentryErrorReporter } from './sentry-error-reporter';

/*
 * The real SDK, against a stand-in for Sentry's ingest endpoint on a local
 * port: what is checked is what actually leaves the process, not what the
 * code believes it handed over.
 */

interface Received {
  path: string;
  /** The envelope's lines, parsed. */
  lines: unknown[];
}

let server: Server;
const received: Received[] = [];
let reporter: SentryErrorReporter;

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      received.push({
        path: request.url ?? '',
        lines: body
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as unknown),
      });
      response.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  reporter = new SentryErrorReporter({
    dsn: `http://publickey@127.0.0.1:${port}/7`,
    environment: 'test',
    release: 'v0.0.0-test',
    service: 'api',
  });
});

afterAll(async () => {
  await SentryErrorReporter.shutdown();
  await new Promise((resolve) => server.close(resolve));
});

/** What of an error event this spec reads. */
interface ReceivedEvent {
  exception: { values: { value: string }[] };
  tags?: Record<string, string>;
  level?: string;
  environment?: string;
  release?: string;
}

function isEvent(line: unknown): line is ReceivedEvent {
  return typeof line === 'object' && line !== null && 'exception' in line;
}

function eventsReceived(): ReceivedEvent[] {
  return received.flatMap((envelope) => envelope.lines).filter(isEvent);
}

describe('SentryErrorReporter', () => {
  it('sends an error to the DSN, with what the application said about where, and nothing of the visitor', async () => {
    const error = new Error(
      'insert failed for ana@example.test at https://site.test/p?token=abc',
    );

    reporter.captureException(error, {
      requestId: 'req-1',
      method: 'POST',
      path: '/api/pages',
    });
    await reporter.flush(5000);

    expect(received.some((r) => r.path.startsWith('/api/7/envelope/'))).toBe(
      true,
    );
    const [event] = eventsReceived();
    expect(event).toBeDefined();
    expect(event?.exception.values[0]?.value).toBe(
      'insert failed for [email] at https://site.test/p?[query]',
    );
    expect(event?.tags).toMatchObject({
      service: 'api',
      request_id: 'req-1',
      http_method: 'POST',
      http_path: '/api/pages',
    });
    expect(event?.environment).toBe('test');
    expect(event?.release).toBe('v0.0.0-test');
    const sent = JSON.stringify(received);
    expect(sent).not.toContain('ana@example.test');
    expect(sent).not.toContain('token=abc');
    for (const key of ['request', 'user', 'breadcrumbs', 'server_name']) {
      expect(event).not.toHaveProperty(key);
    }
  });

  it('marks the error that is about to end the process as fatal', async () => {
    reporter.captureException(new Error('boom'), { fatal: true });
    await reporter.flush(5000);

    const fatal = eventsReceived().find(
      (event) => event.exception.values[0]?.value === 'boom',
    );
    expect(fatal?.level).toBe('fatal');
  });

  it('never throws, whatever it is given', () => {
    expect(() => reporter.captureException(undefined)).not.toThrow();
    expect(() => reporter.captureException({ not: 'an error' })).not.toThrow();
  });
});
