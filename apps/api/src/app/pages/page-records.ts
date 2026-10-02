import { Injectable } from '@nestjs/common';
import type {
  PageGroup,
  PageGroupVersion,
  PageTranslation,
  PageTranslationVersion,
} from '@kometio/domain-core';
import {
  pageGroupRecordSchema,
  pageGroupVersionRecordSchema,
  pageTranslationRecordSchema,
  pageTranslationVersionRecordSchema,
  type PageGroupRecord,
  type PageTranslationRecord,
} from '@kometio/api-contracts';

/**
 * What the pages routes answer with, whitelisted field by field and parsed
 * by the same schemas the editor parses the responses against (security
 * review 2026-08-24): never the raw entity, so a field added to one later
 * is not exposed by accident. Shared by the two controllers that answer
 * with pages.
 */
@Injectable()
export class PageRecords {
  /** Same whitelist discipline as PagesController.toDto (security review 2026-08-24) — never the raw entity. */
  toGroup(group: PageGroup): PageGroupRecord {
    const props = group.toProps();
    return pageGroupRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      parentId: props.parentId,
      order: props.order,
      collectionId: props.collectionId,
      content: props.content,
      createdBy: props.createdBy,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    });
  }

  toTranslation(translation: PageTranslation): PageTranslationRecord {
    const props = translation.toProps();
    return pageTranslationRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      pageGroupId: props.pageGroupId,
      locale: props.locale,
      slug: props.slug,
      seoMeta: props.seoMeta,
      fieldValues: props.fieldValues,
      status: props.status,
      publishedSnapshot: props.publishedSnapshot,
      isDiverged: props.isDiverged,
      divergedContent: props.divergedContent,
      createdBy: props.createdBy,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    });
  }

  toGroupVersion(version: PageGroupVersion) {
    return pageGroupVersionRecordSchema.parse({
      ...version,
      createdAt: version.createdAt.toISOString(),
    });
  }

  toTranslationVersion(version: PageTranslationVersion) {
    return pageTranslationVersionRecordSchema.parse({
      ...version,
      createdAt: version.createdAt.toISOString(),
    });
  }
}
