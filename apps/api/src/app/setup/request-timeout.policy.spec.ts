import { createServer } from 'node:http';
import type { HttpAdapterHost } from '@nestjs/core';
import {
  ARCHIVE_REQUEST_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  RequestTimeoutPolicy,
} from './request-timeout.policy';

/** What the policy reads of Nest's host, which is a class with a whole adapter behind it: the server. */
const hostOf = (server: unknown) =>
  ({
    httpAdapter: { getHttpServer: () => server },
  }) as unknown as HttpAdapterHost;

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
      new RequestTimeoutPolicy(hostOf(undefined)).forInstallation(true),
    ).not.toThrow();
  });
});
