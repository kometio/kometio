import { Logger } from '@nestjs/common';
import type { AuditLogPort } from '@kometio/ports';
import { AuditRecorder } from './audit-recorder';

const event = {
  tenantId: 'tenant-1',
  actorUserId: 'user-1',
  action: 'user.role_changed',
  targetLabel: 'colleague@example.test',
} as const;

describe('AuditRecorder', () => {
  it('hands the entry to the log', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const auditLog: AuditLogPort = { record, list: jest.fn() };

    await new AuditRecorder(auditLog).record(event);

    expect(record).toHaveBeenCalledWith(event);
  });

  it('does not fail the action when the log cannot be written: it says so in the server’s log', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const auditLog: AuditLogPort = {
      record: jest.fn().mockRejectedValue(new Error('connection lost')),
      list: jest.fn(),
    };

    await expect(
      new AuditRecorder(auditLog).record(event),
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      'The activity log could not record user.role_changed',
      expect.stringContaining('connection lost'),
    );
    logged.mockRestore();
  });
});
