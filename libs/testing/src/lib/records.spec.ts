import { describe, expect, it } from 'vitest';
import {
  collectionRecordSchema,
  formRecordSchema,
  mediaRecordSchema,
  reusableSectionListItemSchema,
  reusableSectionRecordSchema,
  siteLayoutSectionRecordSchema,
  siteLayoutSectionVersionRecordSchema,
  taxonomyRecordSchema,
  termRecordSchema,
  userRecordSchema,
  pageGroupListItemSchema,
  pageGroupRecordSchema,
  pageGroupVersionRecordSchema,
  pageTranslationRecordSchema,
  siteRecordSchema,
} from '@kometio/api-contracts';
import {
  buildCollectionRecord,
  buildFormRecord,
  buildMediaRecord,
  buildReusableSectionListItem,
  buildReusableSectionRecord,
  buildSiteLayoutSectionRecord,
  buildSiteLayoutSectionVersionRecord,
  buildTaxonomyRecord,
  buildTermRecord,
  buildUserRecord,
  buildPageGroupListItemRecord,
  buildPageGroupRecord,
  buildPageGroupVersionRecord,
  buildPageTranslationRecord,
  buildSiteRecord,
} from './records.test-fixture';
import {
  buildPageGroup,
  buildPageTranslation,
  buildSite,
} from './entities.test-fixture';

describe('record builders', () => {
  /*
   * The editor parses every response with these schemas, so a default that
   * failed one would hand a spec a record the real client never accepts.
   */
  it('build records the wire schemas accept', () => {
    expect(siteRecordSchema.parse(buildSiteRecord())).toEqual(
      buildSiteRecord(),
    );
    expect(pageGroupRecordSchema.parse(buildPageGroupRecord())).toEqual(
      buildPageGroupRecord(),
    );
    expect(
      pageTranslationRecordSchema.parse(buildPageTranslationRecord()),
    ).toEqual(buildPageTranslationRecord());
    expect(
      pageGroupListItemSchema.parse(buildPageGroupListItemRecord()),
    ).toEqual(buildPageGroupListItemRecord());
    expect(
      pageGroupVersionRecordSchema.parse(buildPageGroupVersionRecord()),
    ).toEqual(buildPageGroupVersionRecord());
    expect(collectionRecordSchema.parse(buildCollectionRecord())).toEqual(
      buildCollectionRecord(),
    );
    expect(mediaRecordSchema.parse(buildMediaRecord())).toEqual(
      buildMediaRecord(),
    );
    expect(formRecordSchema.parse(buildFormRecord())).toEqual(
      buildFormRecord(),
    );
    expect(userRecordSchema.parse(buildUserRecord())).toEqual(
      buildUserRecord(),
    );
    expect(
      siteLayoutSectionRecordSchema.parse(buildSiteLayoutSectionRecord()),
    ).toEqual(buildSiteLayoutSectionRecord());
    expect(
      siteLayoutSectionVersionRecordSchema.parse(
        buildSiteLayoutSectionVersionRecord(),
      ),
    ).toEqual(buildSiteLayoutSectionVersionRecord());
    expect(
      reusableSectionRecordSchema.parse(buildReusableSectionRecord()),
    ).toEqual(buildReusableSectionRecord());
    expect(
      reusableSectionListItemSchema.parse(buildReusableSectionListItem()),
    ).toEqual(buildReusableSectionListItem());
    expect(taxonomyRecordSchema.parse(buildTaxonomyRecord())).toEqual(
      buildTaxonomyRecord(),
    );
    expect(termRecordSchema.parse(buildTermRecord())).toEqual(
      buildTermRecord(),
    );
  });

  it('describe the same site and page as the entity builders', () => {
    const site = buildSite();
    expect(buildSiteRecord()).toMatchObject({
      id: site.id,
      tenantId: site.tenantId,
      name: site.name,
      domain: site.domain,
      defaultLocale: site.defaultLocale,
      enabledLocales: site.enabledLocales,
      createdAt: site.createdAt.toISOString(),
    });

    const group = buildPageGroup();
    expect(buildPageGroupRecord()).toMatchObject({
      id: group.id,
      siteId: group.siteId,
    });

    const translation = buildPageTranslation();
    expect(buildPageTranslationRecord()).toMatchObject({
      id: translation.id,
      pageGroupId: translation.pageGroupId,
      locale: translation.locale,
      slug: translation.slug,
      status: translation.status,
    });
  });

  it('hand out a new object on every call, so one spec cannot leak into the next', () => {
    const first = buildPageGroupListItemRecord();
    const second = buildPageGroupListItemRecord();
    expect(first).not.toBe(second);
    expect(first.translations).not.toBe(second.translations);
    expect(first.translations[0]).not.toBe(second.translations[0]);
  });
});
