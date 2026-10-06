import { Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app/app.module';
import { HttpExceptionFilter } from './app/http-exception.filter';
import { mountMediaStatic } from './app/media-static';
import { requestIdMiddleware } from './app/request-id.middleware';
import { trustProxyHops } from './app/trusted-proxy';
import { validateApiEnv } from './env-schema';
import { rejectCrossSiteWrites } from './app/cross-site-writes.middleware';

// Security review 2026-08-24, "third pass": no global handler — an
// unhandled rejection or a throw outside every try/catch vanished, never
// logged. Node considers the process's state undefined after either of
// those two events (the same reason Node 15+ terminates by default on an
// unhandled unhandledRejection) — so log and exit, rather than carry on
// serving requests in a potentially corrupted state.
process.on('unhandledRejection', (reason) => {
  Logger.error(
    'Unhandled promise rejection',
    reason instanceof Error ? reason.stack : String(reason),
  );
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught exception', error.stack);
  process.exit(1);
});

async function bootstrap() {
  // Fail fast on every missing/invalid env var at once, before any module
  // wiring starts — see env-schema.ts. What it returns is the environment
  // every module reads too (API_ENV), so this and they cannot disagree.
  const env = validateApiEnv();
  const app = await NestFactory.create(AppModule);
  // `docker stop`/`docker-compose down` send SIGTERM — without
  // enableShutdownHooks(), Nest never runs OnModuleDestroy (the Postgres
  // pool gets yanked instead of closed cleanly). enableShutdownHooks()
  // alone runs those hooks but does not itself end the process afterward
  // — verified directly against a real container: without an explicit
  // exit, something (the pg pool's own open socket) keeps the event loop
  // alive, so `docker stop` has to wait out its full grace period and
  // SIGKILL. Same log-and-exit posture as the unhandledRejection/
  // uncaughtException handlers above.
  // Node gives a request five minutes to arrive, whole. The one that can take
  // longer is a site archive uploaded on the first-run screen (docs/adr/0106): it
  // is as big as the site and arrives at the speed of somebody's connection.
  const server: unknown = app.getHttpServer();
  if (server instanceof Server) server.requestTimeout = 2 * 60 * 60 * 1000;
  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      Logger.log(`${signal} received, shutting down`);
      void app.close().finally(() => process.exit(0));
    });
  }
  trustProxyHops(app, Number(env.TRUSTED_PROXY_HOPS ?? 0));
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  // crossOriginResourcePolicy off: media/attachments are meant to be
  // embedded cross-origin by apps/public-site and apps/editor-app.
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(cookieParser());
  app.use(rejectCrossSiteWrites(env.EDITOR_APP_URL));
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter());
  // Credentialed cookies can't use a wildcard origin — must be the exact
  // editor-app origin, see docs/adr/0010-session-based-auth-foundations.md.
  app.enableCors({ origin: env.EDITOR_APP_URL, credentials: true });
  // apps/api serves uploaded files itself — no separate reverse-proxy route
  // to configure for self-hosting, see ADR-0013 — under the global prefix,
  // since the storage adapters build URLs against API_PUBLIC_URL, which
  // already includes it.
  //
  // Through `mountMediaStatic` and nothing else. This file used to carry
  // its own copy of those mounts while the integration tests exercised
  // media-static.ts: the tests checked one configuration and production
  // ran another. Found on 2026-09-13 because a download rule that passed
  // every test was missing on the running API.
  mountMediaStatic(app, env.MEDIA_UPLOAD_DIR, `/${globalPrefix}`);
  const port = env.PORT;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
