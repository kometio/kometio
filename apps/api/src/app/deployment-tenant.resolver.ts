import { Injectable } from '@nestjs/common';
import type { TenantDirectoryPort } from '@kometio/ports';

/**
 * Which tenant this deployment is. Kometio is single-tenant per deployment
 * (docs/adr/0010), so "the tenant" is a deployment-level fact rather than
 * a per-request one — but it is only knowable once the deployment has been
 * set up, which is exactly what the first-run wizard does.
 *
 * Two sources, in order:
 *
 * 1. `DEFAULT_TENANT_ID`, when set. Development and the integration tests
 *    both pin it, and a deployment that already has it in its env keeps
 *    working unchanged — this is why the variable stayed supported rather
 *    than being removed outright.
 * 2. Otherwise the single row in `tenants`. A fresh self-hosted
 *    deployment has no env var and no row: it resolves to `null` until the
 *    wizard creates one, and `refresh()` is what makes the running process
 *    see it without a restart.
 *
 * Cached once resolved, because a deployment's tenant never changes
 * afterwards — the alternative, a query on every request, would put a
 * lookup in front of every public page render for a value that is fixed
 * for the life of the installation.
 *
 * More than one row is a misconfiguration rather than a supported setup
 * (a shared database, most likely): it fails loudly instead of picking one
 * arbitrarily, which would silently serve one customer's content to
 * another's visitors.
 */
/** Thrown by `DeploymentTenantResolver.require()` — see its own comment. */
export class DeploymentNotSetUpError extends Error {
  constructor() {
    super('This Kometio deployment has not been set up yet');
    this.name = 'DeploymentNotSetUpError';
  }
}

@Injectable()
export class DeploymentTenantResolver {
  /**
   * `undefined` = never looked up; `null` = looked up and there is no
   * tenant yet. The two have to be distinguishable, or `refresh()` could
   * not tell "nothing there last time, look again" from "nothing there,
   * and that is settled".
   */
  private cached: string | null | undefined;

  constructor(
    private readonly directory: TenantDirectoryPort,
    private readonly envTenantId: string | undefined,
  ) {}

  /** The tenant id, or `null` when this deployment has not been set up yet. */
  async resolve(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached;
    if (this.envTenantId) {
      this.cached = this.envTenantId;
      return this.cached;
    }

    // Two rather than one: a second row has to be distinguishable from "the
    // only row", and `limit(2)` costs the same as `limit(1)` here.
    const ids = await this.directory.listIds(2);

    if (ids.length > 1) {
      throw new Error(
        'More than one tenant found. Kometio is single-tenant per deployment ' +
          '(docs/adr/0010) — set DEFAULT_TENANT_ID to say which one this ' +
          'deployment serves, or give each one its own database.',
      );
    }
    this.cached = ids[0] ?? null;
    return this.cached;
  }

  /**
   * The tenant id, for the paths where its absence is not a state that can
   * be reached: anything behind a session, or behind a token this
   * deployment itself issued. There are no sessions before there is a
   * tenant, so a caller here failing is a real fault rather than a
   * not-set-up-yet visitor, and it should surface as one.
   */
  async require(): Promise<string> {
    const id = await this.resolve();
    if (!id) throw new DeploymentNotSetUpError();
    return id;
  }

  /**
   * Forgets a cached miss, so the first-run wizard's own request makes the
   * already-running process see the tenant it just created — without a
   * restart, which a self-hoster in a browser has no way to trigger.
   *
   * Deliberately only clears a miss. A resolved id is a fact that cannot
   * change for the life of the installation, and letting it be cleared
   * would be a way for one deployment to start serving another's data.
   */
  refresh(): void {
    if (this.cached === null) this.cached = undefined;
  }
}

/**
 * One token, shared by every module that needs it, rather than a private
 * one per module the way `DEFAULT_TENANT_ID` was duplicated across four —
 * the resolver caches, and a per-module provider would defeat that by
 * giving each its own cache and its own database lookup.
 */
export const DEPLOYMENT_TENANT_RESOLVER = Symbol('DEPLOYMENT_TENANT_RESOLVER');
