import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type {
  BootstrapDeploymentInput,
  BootstrapDeploymentResult,
  DeploymentBootstrapPort,
} from '@kometio/ports';
import type { KometioDb } from './client';
import { pageGroups, pageTranslations, sites, tenants, users } from './schema';

/**
 * Replaces what `scripts/seed-default-tenant.ts` and
 * `scripts/seed-default-user.ts` do, for the first-run wizard: tenant,
 * site and admin user created together, from a browser, without shell
 * access to a container and without the admin password ever being written
 * to a `.env` file — plus the starter home page, so what the wizard hands
 * back is a site that actually renders.
 *
 * The two scripts stay for development, where re-seeding a throwaway
 * database from a fixed `DEFAULT_TENANT_ID` is genuinely convenient. They
 * are no longer the documented path for a real deployment.
 *
 * One explicit transaction rather than `withTenant`: the tenant does not
 * exist yet when it opens, so there is nothing to scope to. It sets
 * `app.current_tenant_id` itself, after the tenant row and before every
 * row RLS actually guards — the same `set_config(..., true)` withTenant
 * uses, local to this transaction because connections are pooled.
 */
export class DrizzleDeploymentBootstrapAdapter implements DeploymentBootstrapPort {
  constructor(private readonly db: KometioDb) {}

  async hasBeenSetUp(): Promise<boolean> {
    // `tenants` is the root table and carries no RLS policy (see
    // schema.ts), which is what makes it readable at all before any tenant
    // context exists.
    const rows = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .limit(1);
    return rows.length > 0;
  }

  async bootstrap(
    input: BootstrapDeploymentInput,
  ): Promise<BootstrapDeploymentResult> {
    const tenantId = randomUUID();
    const siteId = randomUUID();
    const userId = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(tenants).values({ id: tenantId, name: input.siteName });

      // From here on the transaction is scoped to the tenant just created,
      // so the RLS policies on `sites`, `users` and the two page tables
      // let those rows through. Without it they would be inserted and then
      // be invisible — including to the login that follows immediately.
      await tx.execute(
        sql`select set_config('app.current_tenant_id', ${tenantId}, true)`,
      );

      await tx.insert(sites).values({
        id: siteId,
        tenantId,
        name: input.siteName,
        // What the wizard was given: the editor proposes the hostname of
        // the address the deployment was told to serve the site on, and the
        // admin may change it or clear it. apps/public-site matches a site
        // by the request's Host header, so a site without one is found at no
        // address; null is the admin's own choice to set it later, in Site
        // settings, which is also where that consequence is visible.
        domain: input.domain,
        defaultLocale: input.defaultLocale,
        // Must contain defaultLocale (localeSettingsSchema): a site whose
        // default locale is not enabled resolves no pages at all.
        enabledLocales: [input.defaultLocale],
      });

      await tx.insert(users).values({
        id: userId,
        tenantId,
        email: input.adminEmail,
        passwordHash: input.adminPasswordHash,
        role: 'admin',
      });

      // The starter home page, in the same transaction as everything else
      // for the same reason the user is: a deployment left with a site but
      // no page is one whose public homepage 404s, which is precisely the
      // state this seeds its way out of.
      const pageGroupId = randomUUID();
      await tx.insert(pageGroups).values({
        id: pageGroupId,
        tenantId,
        siteId,
        content: input.homePage.content,
        createdBy: userId,
      });

      await tx.insert(pageTranslations).values({
        id: randomUUID(),
        tenantId,
        siteId,
        pageGroupId,
        // Root-level, so no parent group — the same null the sibling-scoped
        // slug uniqueness index treats as "top of the tree".
        parentGroupId: null,
        locale: input.homePage.locale,
        slug: input.homePage.slug,
        // `description: ''` matches what the editor itself writes when a
        // page is created (use-page-groups-list.ts) — seoMetaSchema requires
        // the key, and an invented description would be worse than none.
        seoMeta: { title: input.homePage.title, description: '' },
        status: 'published',
        // Published means public resolution reads this, not `content` —
        // the page would exist but still not render without it. Equal to
        // the group's content because a page with no translated overrides
        // merges to exactly that (see mergeTranslatedContent).
        publishedSnapshot: input.homePage.content,
        createdBy: userId,
      });
    });

    return { tenantId, siteId, userId };
  }
}
