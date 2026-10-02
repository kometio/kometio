import { Injectable } from '@nestjs/common';
import type {
  ReusableSection,
  ReusableSectionVersion,
} from '@kometio/domain-core';
import {
  type ReusableSectionRecord,
  type ReusableSectionVersionRecord,
  reusableSectionRecordSchema,
  reusableSectionVersionRecordSchema,
} from '@kometio/api-contracts';

/**
 * How a reusable section leaves the server (docs/adr/0026) — whitelisted
 * field by field, never the entity's props spread, so a field
 * `ReusableSection` gains later stays inside until somebody decides it
 * should not.
 *
 * Its own collaborator rather than a private method, because two
 * controllers answer with a section: this module's, and "Save as template"
 * in the pages module (docs/adr/0072). Stateless, so each module provides
 * its own instance instead of importing the other.
 */
@Injectable()
export class ReusableSectionRecords {
  toRecord(section: ReusableSection): ReusableSectionRecord {
    const props = section.toProps();
    return reusableSectionRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      siteId: props.siteId,
      name: props.name,
      kind: props.kind,
      status: props.status,
      content: props.content,
      publishedContent: props.publishedContent,
      exposedFields: props.exposedFields,
      createdBy: props.createdBy,
      createdAt: props.createdAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    });
  }

  toVersionRecord(
    version: ReusableSectionVersion,
  ): ReusableSectionVersionRecord {
    return reusableSectionVersionRecordSchema.parse({
      id: version.id,
      tenantId: version.tenantId,
      reusableSectionId: version.reusableSectionId,
      content: version.content,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
    });
  }
}
