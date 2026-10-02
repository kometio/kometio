import { type Site, SiteNotFoundError } from '@kometio/domain-core';
import { buildSite, InMemorySiteRepository } from '@kometio/testing';
import { DeploymentSiteResolver } from './deployment-site.resolver';

/** Spied on, so a test can also say which lookup the resolver never made. */
async function repositoryWith(...sites: Site[]) {
  const repository = new InMemorySiteRepository();
  for (const site of sites) {
    await repository.add(site);
  }
  return {
    repository,
    findById: jest.spyOn(repository, 'findById'),
    listByTenant: jest.spyOn(repository, 'listByTenant'),
  };
}

describe('DeploymentSiteResolver', () => {
  it('resolves the tenant’s only site when no id is pinned', async () => {
    const site = buildSite({ id: 'site-1' });
    const { repository, findById, listByTenant } = await repositoryWith(site);

    const resolver = new DeploymentSiteResolver(repository, undefined);

    expect(await resolver.require('tenant-1')).toBe(site);
    expect(listByTenant).toHaveBeenCalledWith('tenant-1');
    expect(findById).not.toHaveBeenCalled();
  });

  it('prefers the pinned DEFAULT_SITE_ID over looking one up', async () => {
    const pinned = buildSite({ id: 'pinned-site' });
    const { repository, findById, listByTenant } = await repositoryWith(
      pinned,
      buildSite({ id: 'site-1' }),
    );

    const resolver = new DeploymentSiteResolver(repository, 'pinned-site');

    expect(await resolver.require('tenant-1')).toBe(pinned);
    expect(findById).toHaveBeenCalledWith('tenant-1', 'pinned-site');
    expect(listByTenant).not.toHaveBeenCalled();
  });

  // A mistyped id must not quietly become "whichever site happens to be
  // there" — that is how an operator ends up editing the wrong customer's
  // site without ever being told.
  it('fails instead of falling back when the pinned id matches nothing', async () => {
    const { repository, listByTenant } = await repositoryWith(
      buildSite({ id: 'some-other-site' }),
    );

    const resolver = new DeploymentSiteResolver(repository, 'missing-site');

    await expect(resolver.require('tenant-1')).rejects.toThrow(
      /DEFAULT_SITE_ID is set to missing-site/,
    );
    expect(listByTenant).not.toHaveBeenCalled();
  });

  it('fails loudly rather than picking one when the tenant has several', async () => {
    const { repository } = await repositoryWith(
      buildSite({ id: 'site-1' }),
      buildSite({ id: 'site-2' }),
    );

    const resolver = new DeploymentSiteResolver(repository, undefined);

    await expect(resolver.require('tenant-1')).rejects.toThrow(
      /DEFAULT_SITE_ID/,
    );
  });

  it('fails when the tenant has no site at all', async () => {
    const { repository } = await repositoryWith(
      buildSite({ id: 'site-1', tenantId: 'another-tenant' }),
    );

    const resolver = new DeploymentSiteResolver(repository, undefined);

    await expect(resolver.require('tenant-1')).rejects.toThrow(/no site/);
  });

  // A 404 would say "you asked for something that is not there" — but this
  // endpoint takes no id, so there is nothing the caller could have asked
  // for wrongly. Every failure here is the deployment's, not theirs.
  it('never raises the 404-mapped SiteNotFoundError', async () => {
    const { repository } = await repositoryWith();

    const error = await new DeploymentSiteResolver(repository, undefined)
      .require('tenant-1')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SiteNotFoundError);
  });
});
