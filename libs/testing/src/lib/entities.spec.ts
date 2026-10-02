import { describe, expect, it } from 'vitest';
import {
  buildPageGroup,
  buildPageTranslation,
  buildReusableSection,
  buildSite,
  buildSiteLayoutSection,
  buildUser,
} from './entities.test-fixture';

describe('entity builders', () => {
  it('build valid entities from readable defaults', () => {
    expect(buildSite().toProps()).toMatchObject({
      id: 'site-1',
      tenantId: 'tenant-1',
      defaultLocale: 'it',
      enabledLocales: ['it'],
    });
    expect(buildUser().role).toBe('admin');
    expect(buildPageGroup().siteId).toBe('site-1');
    expect(buildPageTranslation().pageGroupId).toBe('group-1');
    expect(buildSiteLayoutSection().kind).toBe('header');
    expect(buildReusableSection().kind).toBe('shared');
  });

  /*
   * The whole point of a builder: a spec states only what its test is
   * about, and everything else stays neutral.
   */
  it('let a spec override exactly the fields its test is about', () => {
    const site = buildSite({
      defaultLocale: 'en',
      enabledLocales: ['en', 'it'],
    });
    expect(site.defaultLocale).toBe('en');
    expect(site.enabledLocales).toEqual(['en', 'it']);
    expect(site.name).toBe('Test site');

    expect(buildUser({ role: 'editor', isActive: false })).toMatchObject({
      role: 'editor',
      isActive: false,
    });
    expect(buildPageTranslation({ locale: 'en', slug: 'about' }).slug).toBe(
      'about',
    );
  });

  it('hand out a new object on every call, so one spec cannot leak into the next', () => {
    const first = buildSite();
    const second = buildSite();
    expect(first).not.toBe(second);
    expect(first.enabledLocales).not.toBe(second.enabledLocales);
  });
});
