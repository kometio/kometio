import { Server } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** What Node gives a request to arrive, whole, when nothing says otherwise. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * What a site archive uploaded on the first-run screen is given
 * (docs/adr/0106): it is as big as the site and arrives at the speed of
 * somebody's connection.
 */
export const ARCHIVE_REQUEST_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * How long a request may take to arrive, which the server applies to every
 * request alike: a client that sends a body a byte at a time holds its
 * connection for as long as that is. Two hours for all of them, for ever, was
 * the price of the one request that needs it, and the one request is possible
 * only while the installation has no site. So the long wait is given while
 * there is none, and taken back the moment there is one: when the wizard has
 * made it, and at the start of a process that finds it there.
 */
@Injectable()
export class RequestTimeoutPolicy {
  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  forInstallation(hasBeenSetUp: boolean): void {
    const server: unknown = this.adapterHost.httpAdapter?.getHttpServer();
    if (!(server instanceof Server)) return;
    server.requestTimeout = hasBeenSetUp
      ? DEFAULT_REQUEST_TIMEOUT_MS
      : ARCHIVE_REQUEST_TIMEOUT_MS;
  }
}
