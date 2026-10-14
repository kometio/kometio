import { ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import { executionContextOf } from '../../test/http-doubles.test-fixture';
import {
  AttachmentQuotaGuard,
  DAILY_ATTACHMENTS_PER_FORM,
} from './attachment-quota.guard';

/** Counts per key, as the in-memory storage does. */
class CountingStorage implements ThrottlerStorage {
  private hits = new Map<string, number>();

  async increment(key: string) {
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    return {
      totalHits,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}

function uploadTo(formId: string, ip: string) {
  return executionContextOf({
    request: { params: { id: formId }, ip },
    handler: 'uploadAttachment',
    controller: 'PublicFormsController',
  });
}

describe('AttachmentQuotaGuard', () => {
  it('stops a form at its daily ceiling, however many addresses send', async () => {
    const guard = new AttachmentQuotaGuard(new CountingStorage());
    for (let i = 0; i < DAILY_ATTACHMENTS_PER_FORM; i++) {
      await guard.canActivate(uploadTo('form-a', `203.0.113.${i % 250}`));
    }

    await expect(
      guard.canActivate(uploadTo('form-a', '198.51.100.1')),
    ).rejects.toThrow(ThrottlerException);
  });

  it('counts each form on its own', async () => {
    const guard = new AttachmentQuotaGuard(new CountingStorage());
    for (let i = 0; i < DAILY_ATTACHMENTS_PER_FORM; i++) {
      await guard.canActivate(uploadTo('form-a', '203.0.113.1'));
    }

    await expect(
      guard.canActivate(uploadTo('form-b', '203.0.113.1')),
    ).resolves.toBe(true);
  });
});
