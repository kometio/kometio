import { describe, expect, it, vi } from 'vitest';
import type { AuditLogPort } from '@kometio/ports';
import { AUDIT_RETENTION_DAYS } from '@kometio/shared-types';
import { listAuditEvents } from './list-audit-events.use-case';
import { purgeAuditEvents } from './purge-audit-events.use-case';

describe('listAuditEvents', () => {
  it('asks the log for the page, for the tenant it was asked for', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const auditLog: AuditLogPort = { record: vi.fn(), list };

    await listAuditEvents(
      { auditLog },
      { tenantId: 'tenant-1', page: 3, pageSize: 25 },
    );

    expect(list).toHaveBeenCalledWith('tenant-1', { page: 3, pageSize: 25 });
  });
});

describe('purgeAuditEvents', () => {
  it('removes what is older than the retention, counted from now', async () => {
    const deleteAuditEventsBefore = vi
      .fn()
      .mockResolvedValue({ deletedEvents: 4 });
    const now = new Date('2026-10-14T12:00:00Z');

    const result = await purgeAuditEvents(
      { expiredRecords: { deleteAuditEventsBefore } },
      { tenantId: 'tenant-1', now },
    );

    expect(result).toEqual({ deletedEvents: 4 });
    const [tenant, before] = deleteAuditEventsBefore.mock.calls[0];
    expect(tenant).toBe('tenant-1');
    expect(before.toISOString()).toBe('2026-07-16T12:00:00.000Z');
    expect(AUDIT_RETENTION_DAYS).toBe(90);
  });
});
