import { createServer } from 'node:http';
import { HttpAdapterHost } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import {
  ARCHIVE_REQUEST_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  RequestTimeoutPolicy,
} from './request-timeout.policy';

/** Nest's own host, over an adapter that has been given the server — or has not. */
function hostOf(server?: ReturnType<typeof createServer>): HttpAdapterHost {
  const adapter = new ExpressAdapter();
  if (server) adapter.setHttpServer(server);
  const host = new HttpAdapterHost();
  host.httpAdapter = adapter;
  return host;
}

describe('RequestTimeoutPolicy', () => {
  it('gives an archive time to arrive while there is no site to receive it into', () => {
    const server = createServer();

    new RequestTimeoutPolicy(hostOf(server)).forInstallation(false);

    expect(server.requestTimeout).toBe(ARCHIVE_REQUEST_TIMEOUT_MS);
  });

  it('takes it back once there is a site: a request is given what Node gives', () => {
    const server = createServer();
    const policy = new RequestTimeoutPolicy(hostOf(server));

    policy.forInstallation(false);
    policy.forInstallation(true);

    expect(server.requestTimeout).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it('leaves alone a server it is not given', () => {
    expect(() =>
      new RequestTimeoutPolicy(hostOf()).forInstallation(true),
    ).not.toThrow();
  });
});
