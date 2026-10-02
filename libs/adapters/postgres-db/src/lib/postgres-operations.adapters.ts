import type {
  DatabaseHealthPort,
  ExpiredRecordsPort,
  ExpiredTokensRemoved,
  TenantDirectoryPort,
} from '@kometio/ports';
import { type KometioDb, pingDatabase } from './client';
import { deleteExpiredTokens } from './expired-tokens-cleanup';
import { deleteExpiredFormSubmissions } from './form-submissions-retention-cleanup';
import { tenants } from './schema';

export class PostgresDatabaseHealth implements DatabaseHealthPort {
  constructor(private readonly db: KometioDb) {}

  ping(): Promise<void> {
    return pingDatabase(this.db);
  }
}

export class PostgresExpiredRecords implements ExpiredRecordsPort {
  constructor(private readonly db: KometioDb) {}

  deleteExpiredTokens(tenantId: string): Promise<ExpiredTokensRemoved> {
    return deleteExpiredTokens(this.db, tenantId);
  }

  deleteExpiredFormSubmissions(
    tenantId: string,
  ): Promise<{ deletedSubmissions: number }> {
    return deleteExpiredFormSubmissions(this.db, tenantId);
  }
}

export class PostgresTenantDirectory implements TenantDirectoryPort {
  constructor(private readonly db: KometioDb) {}

  async listIds(limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .limit(limit);
    return rows.map((row) => row.id);
  }
}
