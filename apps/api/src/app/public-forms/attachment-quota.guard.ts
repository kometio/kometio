import { Injectable } from '@nestjs/common';
import {
  KeyedThrottlerGuard,
  type ThrottleBucket,
  type ThrottledRequest,
} from '../keyed-throttler.guard';

/**
 * The largest file a visitor may attach: a CV, a photo of the problem. An
 * anonymous upload, so smaller than what the media library takes from a
 * signed-in editor (MAX_UPLOAD_BYTES_BY_KIND).
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** How many files one form takes in a day, from everyone together. */
export const DAILY_ATTACHMENTS_PER_FORM = 100;

/**
 * A daily ceiling per form on public attachment uploads (audit B4). The
 * per-address limit alone let enough addresses fill the disk ten files a
 * minute each; a hundred files of up to 10 MB a day is more than a real
 * form gets, and the night's sweep removes every one no submission names.
 */
@Injectable()
export class AttachmentQuotaGuard extends KeyedThrottlerGuard {
  protected buckets(request: ThrottledRequest): ThrottleBucket[] {
    const formId = request.params?.['id'];
    if (!formId) return [];
    return [
      {
        key: `attachments:${formId}`,
        limit: DAILY_ATTACHMENTS_PER_FORM,
        ttlMs: 24 * 60 * 60 * 1000,
      },
    ];
  }
}
