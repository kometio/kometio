import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { DatabaseHealthPort } from '@kometio/ports';
import { DATABASE_HEALTH } from '../adapters/port.tokens';

/**
 * Unauthenticated on purpose — this is the Docker/Caddy healthcheck target
 * (docs/adr/0042), checked before a session exists and often by something
 * that isn't a browser at all. Round-trips Postgres rather than just
 * returning a static 200: a container that's up but can't reach its own
 * database should read as unhealthy, not healthy.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_HEALTH) private readonly database: DatabaseHealthPort,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.database.ping();
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : 'Database unreachable',
      );
    }
    return { status: 'ok' };
  }
}
