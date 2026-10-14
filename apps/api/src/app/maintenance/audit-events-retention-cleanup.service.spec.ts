import { Logger } from '@nestjs/common';
import type { ExpiredRecordsPort } from '@kometio/ports';
import { AuditEventsRetentionCleanupService } from './audit-events-retention-cleanup.service';

function expiredRecords(deleted = 3) {
  const deleteAuditEventsBefore = jest
    .fn()
    .mockResolvedValue({ deletedEvents: deleted });
  const port: ExpiredRecordsPort = {
    deleteExpiredTokens: jest.fn(),
    deleteExpiredFormSubmissions: jest.fn(),
    deleteAuditEventsBefore,
  };
  return { port, deleteAuditEventsBefore };
}

describe('AuditEventsRetentionCleanupService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('removes what is older than ninety days, for the tenant there is', async () => {
    const { port, deleteAuditEventsBefore } = expiredRecords();
    const service = new AuditEventsRetentionCleanupService(
      port,
      async () => 'tenant-1',
    );
    const before = Date.now();

    await service.cleanupExpiredAuditEvents();

    const [tenantId, cutoff] = deleteAuditEventsBefore.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    const ageDays = (before - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeGreaterThan(89.99);
    expect(ageDays).toBeLessThan(90.01);
  });

  it('does nothing before the first run has made a site', async () => {
    const { port, deleteAuditEventsBefore } = expiredRecords();
    const service = new AuditEventsRetentionCleanupService(
      port,
      async () => null,
    );

    await service.cleanupExpiredAuditEvents();

    expect(deleteAuditEventsBefore).not.toHaveBeenCalled();
  });
});
