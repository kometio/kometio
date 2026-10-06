import { Logger, Module, type FactoryProvider } from '@nestjs/common';
import { DrizzleDashboardStatsRepository } from '@kometio/postgres-dashboard-stats-repository';
import {
  DrizzleDeploymentBootstrapAdapter,
  PostgresDatabaseHealth,
  PostgresExpiredRecords,
  type KometioDb,
} from '@kometio/postgres-db';
import { FilesystemThemeUploadAdapter } from '@kometio/filesystem-theme-catalog';
import { LauncherSiteArchiveAdapter } from '@kometio/launcher-site-archive';
import {
  DrizzleFormRepository,
  DrizzleFormSubmissionRepository,
} from '@kometio/postgres-form-repository';
import { DrizzleImportJobRepository } from '@kometio/postgres-import-job-repository';
import {
  DrizzleMediaRepository,
  DrizzleMediaUsageRepository,
} from '@kometio/postgres-media-repository';
import {
  DrizzleCollectionRepository,
  DrizzlePageGroupRepository,
  DrizzlePageGroupVersionRepository,
  DrizzlePageTranslationRepository,
  DrizzlePageTranslationVersionRepository,
} from '@kometio/postgres-page-repository';
import {
  DrizzleReusableSectionRepository,
  DrizzleReusableSectionVersionRepository,
} from '@kometio/postgres-reusable-section-repository';
import { DrizzleSearchRepository } from '@kometio/postgres-search-repository';
import {
  DrizzleSiteLayoutSectionRepository,
  DrizzleSiteLayoutSectionVersionRepository,
} from '@kometio/postgres-site-layout-section-repository';
import {
  DrizzleSiteAiSettingsRepository,
  DrizzleSiteRepository,
  DrizzleSiteThemeBlockStylesRepository,
} from '@kometio/postgres-site-repository';
import { DrizzleTaxonomyRepository } from '@kometio/postgres-taxonomy-repository';
import { DrizzleUserRepository } from '@kometio/postgres-user-repository';
import type { PageGeneratorConnection } from '@kometio/ports';
import { PreviewTokenAdapter } from '@kometio/preview-token-adapter';
import { SessionAuthAdapter } from '@kometio/session-auth-adapter';
import { VerificationTokenAdapter } from '@kometio/verification-token-adapter';
import { WxrExportReader } from '@kometio/wordpress-wxr';
import type { ApiEnv } from '../../env-schema';
import { API_ENV, ApiEnvModule } from '../api-env.module';
import { DATABASE, DatabaseModule } from '../database.module';
import { DeploymentTenantModule } from '../deployment-tenant.module';
import {
  DEPLOYMENT_TENANT_RESOLVER,
  type DeploymentTenantResolver,
} from '../deployment-tenant.resolver';
import { createCaptcha, type DeploymentCaptcha } from './captcha.factory';
import { createEmailPort } from './email.factory';
import { createNewsletterPort } from './newsletter.factory';
import { createPageGenerator } from './page-generator.factory';
import { coreContentSanitizer } from '../rich-text/sanitize-page-content';
import * as port from './port.tokens';
import { createSecretCipher } from './secret-cipher.factory';
import {
  createAttachmentStorage,
  createMediaStorage,
} from './storage.factories';
import { createThemeCatalog } from './theme-catalog.factory';

/** A port answered by a table in the app's database. */
function stored<T>(
  provide: symbol,
  create: (db: KometioDb) => T,
): FactoryProvider<T> {
  return { provide, useFactory: create, inject: [DATABASE] };
}

/** A port whose adapter is chosen, or configured, by the environment. */
function configured<T>(
  provide: symbol,
  create: (env: ApiEnv) => T,
): FactoryProvider<T> {
  return { provide, useFactory: create, inject: [API_ENV] };
}

/** A port whose adapter works inside the deployment's one tenant. */
function perTenant<T>(
  provide: symbol,
  create: (db: KometioDb, tenantId: () => Promise<string>) => T,
): FactoryProvider<T> {
  return {
    provide,
    useFactory: (db: KometioDb, tenant: DeploymentTenantResolver) =>
      create(db, () => tenant.require()),
    inject: [DATABASE, DEPLOYMENT_TENANT_RESOLVER],
  };
}

const PROVIDERS = [
  stored(port.SITE_REPOSITORY, (db) => new DrizzleSiteRepository(db)),
  stored(
    port.SITE_THEME_BLOCK_STYLES_REPOSITORY,
    (db) => new DrizzleSiteThemeBlockStylesRepository(db),
  ),
  stored(
    port.SITE_AI_SETTINGS_REPOSITORY,
    (db) => new DrizzleSiteAiSettingsRepository(db),
  ),
  stored(
    port.PAGE_GROUP_REPOSITORY,
    (db) => new DrizzlePageGroupRepository(db),
  ),
  stored(
    port.PAGE_GROUP_VERSION_REPOSITORY,
    (db) => new DrizzlePageGroupVersionRepository(db),
  ),
  stored(
    port.PAGE_TRANSLATION_REPOSITORY,
    (db) => new DrizzlePageTranslationRepository(db),
  ),
  stored(
    port.PAGE_TRANSLATION_VERSION_REPOSITORY,
    (db) => new DrizzlePageTranslationVersionRepository(db),
  ),
  stored(
    port.COLLECTION_REPOSITORY,
    (db) => new DrizzleCollectionRepository(db),
  ),
  stored(
    port.REUSABLE_SECTION_REPOSITORY,
    (db) => new DrizzleReusableSectionRepository(db),
  ),
  stored(
    port.REUSABLE_SECTION_VERSION_REPOSITORY,
    (db) => new DrizzleReusableSectionVersionRepository(db),
  ),
  stored(
    port.SITE_LAYOUT_SECTION_REPOSITORY,
    (db) => new DrizzleSiteLayoutSectionRepository(db),
  ),
  stored(
    port.SITE_LAYOUT_SECTION_VERSION_REPOSITORY,
    (db) => new DrizzleSiteLayoutSectionVersionRepository(db),
  ),
  stored(port.TAXONOMY_REPOSITORY, (db) => new DrizzleTaxonomyRepository(db)),
  stored(port.SEARCH_PORT, (db) => new DrizzleSearchRepository(db)),
  stored(port.USER_REPOSITORY, (db) => new DrizzleUserRepository(db)),
  stored(port.FORM_REPOSITORY, (db) => new DrizzleFormRepository(db)),
  stored(
    port.FORM_SUBMISSION_REPOSITORY,
    (db) => new DrizzleFormSubmissionRepository(db),
  ),
  stored(port.MEDIA_REPOSITORY, (db) => new DrizzleMediaRepository(db)),
  stored(port.MEDIA_USAGE_PORT, (db) => new DrizzleMediaUsageRepository(db)),
  stored(
    port.IMPORT_JOB_REPOSITORY,
    (db) => new DrizzleImportJobRepository(db),
  ),
  stored(
    port.DASHBOARD_STATS_PORT,
    (db) => new DrizzleDashboardStatsRepository(db),
  ),
  stored(port.DATABASE_HEALTH, (db) => new PostgresDatabaseHealth(db)),
  stored(port.EXPIRED_RECORDS, (db) => new PostgresExpiredRecords(db)),
  stored(
    port.DEPLOYMENT_BOOTSTRAP_PORT,
    (db) => new DrizzleDeploymentBootstrapAdapter(db),
  ),

  perTenant(
    port.AUTH_PORT,
    (db, tenantId) => new SessionAuthAdapter(db, tenantId),
  ),
  perTenant(
    port.VERIFICATION_TOKEN_PORT,
    (db, tenantId) => new VerificationTokenAdapter(db, tenantId),
  ),
  configured(
    port.PREVIEW_TOKEN_PORT,
    (env) => new PreviewTokenAdapter(env.PREVIEW_TOKEN_SECRET),
  ),

  configured(port.MEDIA_STORAGE, createMediaStorage),
  configured(port.ATTACHMENT_STORAGE, createAttachmentStorage),
  configured(port.THEME_CATALOG, createThemeCatalog),
  // Off unless the deployment gives the theme volume: an API that could
  // queue an upload no builder will ever read would leave the editor
  // waiting forever.
  configured(port.THEME_UPLOADS, (env) =>
    env.THEME_DATA_DIR
      ? new FilesystemThemeUploadAdapter(env.THEME_DATA_DIR)
      : null,
  ),
  { provide: port.WORDPRESS_EXPORT_READER, useClass: WxrExportReader },
  // The core registry only, which is all a running API can know (see
  // sanitize-page-content.ts): a theme's own blocks are sanitised again by
  // the renderer (ADR-0046).
  { provide: port.CONTENT_SANITIZER, useValue: coreContentSanitizer },

  // SMTP_USER/SMTP_PASSWORD are optional — Mailpit (local dev) needs
  // neither, see docs/development.md.
  // The mail server when SMTP_HOST is set, the log when it is not (docs/adr/0103).
  configured(port.EMAIL_PORT, (env) => {
    const log = new Logger('Email');
    return createEmailPort(env, (entry) => log.warn(entry));
  }),
  // Cloudflare's when the deployment has its keys, the built-in one when it has
  // none (docs/adr/0103). One object, so the challenge a visitor is given and the
  // solution that is checked are the same adapter, with the same memory of the
  // ones already spent.
  configured(port.DEPLOYMENT_CAPTCHA, createCaptcha),
  {
    provide: port.CAPTCHA_PORT,
    useFactory: (captcha: DeploymentCaptcha) => captcha.verifier,
    inject: [port.DEPLOYMENT_CAPTCHA],
  },
  {
    provide: port.CAPTCHA_CHALLENGE_PORT,
    useFactory: (captcha: DeploymentCaptcha) => captcha.challenges,
    inject: [port.DEPLOYMENT_CAPTCHA],
  },
  configured(port.NEWSLETTER_PORT, createNewsletterPort),
  // Only the single image makes one, through the socket its launcher listens
  // on (docs/adr/0105): the API is not given the means to dump the database.
  configured(port.SITE_ARCHIVE, (env) =>
    env.KOMETIO_CONTROL_SOCKET
      ? new LauncherSiteArchiveAdapter({
          socketPath: env.KOMETIO_CONTROL_SOCKET,
        })
      : null,
  ),
  configured(port.SECRET_CIPHER, createSecretCipher),
  // Whether a site's model server may be inside the network (a model on
  // the same machine, say) is the operator's call, read once.
  configured(port.PAGE_GENERATOR_FACTORY, (env) => {
    const network = {
      allowPrivateHosts: env.KOMETIO_AI_ALLOW_PRIVATE_HOSTS === 'true',
    };
    return (connection: PageGeneratorConnection) =>
      createPageGenerator(connection, network);
  }),
];

/**
 * Which adapter answers each port (port.tokens.ts), decided once for the
 * whole API — the one place that knows Postgres, SMTP, S3 or Turnstile by
 * name. A feature module imports this and names, in its deps object, the
 * ports its use cases need.
 *
 * Imported explicitly rather than made `@Global`, for the reason
 * DeploymentTenantModule gives: an integration spec builds a smaller graph
 * than the app, and importing the same module from many places still
 * shares one instance of each adapter.
 */
@Module({
  imports: [DatabaseModule, DeploymentTenantModule, ApiEnvModule],
  providers: PROVIDERS,
  exports: PROVIDERS.map((provider) => provider.provide),
})
export class AdaptersModule {}
