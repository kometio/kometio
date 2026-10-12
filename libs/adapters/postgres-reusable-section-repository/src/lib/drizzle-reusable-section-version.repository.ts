import type { ReusableSectionVersion } from '@kometio/domain-core';
import {
  DrizzleVersionRepository,
  type KometioDb,
  type VersionTable,
  reusableSectionVersions,
} from '@kometio/postgres-db';

/** The table of a reusable section's versions. */
export const reusableSectionVersionTable: VersionTable<ReusableSectionVersion> =
  {
    table: reusableSectionVersions,
    columns: {
      id: reusableSectionVersions.id,
      tenantId: reusableSectionVersions.tenantId,
      owner: reusableSectionVersions.reusableSectionId,
      createdAt: reusableSectionVersions.createdAt,
    },
    ownerIdOf: (version) => version.reusableSectionId,
  };

/** The history of a reusable section. */
export class DrizzleReusableSectionVersionRepository extends DrizzleVersionRepository<ReusableSectionVersion> {
  constructor(db: KometioDb) {
    super(db, reusableSectionVersionTable);
  }
}
