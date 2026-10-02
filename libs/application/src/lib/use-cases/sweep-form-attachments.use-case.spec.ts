import { describe, expect, it } from 'vitest';
import { FormSubmission } from '@kometio/domain-core';
import {
  FakeAttachmentStorage,
  InMemoryFormSubmissionRepository,
} from '@kometio/testing';
import { sweepFormAttachments } from './sweep-form-attachments.use-case';

const tenantId = 'tenant-1';
const formId = '5b0a4c1e-7f3d-4e2a-9c61-2d8e4f1a3b70';
const yesterday = new Date('2026-09-28T09:00:00Z');
const dayBefore = new Date('2026-09-27T09:00:00Z');
const aMomentAgo = new Date('2026-09-29T08:59:00Z');
const cutOff = new Date('2026-09-28T12:00:00Z');

function setup() {
  return {
    attachmentStorage: new FakeAttachmentStorage(),
    formSubmissionRepository: new InMemoryFormSubmissionRepository(),
  };
}

async function uploadAt(
  deps: ReturnType<typeof setup>,
  when: Date,
  filename = 'cv.pdf',
) {
  deps.attachmentStorage.now = () => when;
  return deps.attachmentStorage.upload({
    formId,
    filename,
    mimeType: 'application/pdf',
    extension: 'pdf',
    data: new Uint8Array(),
  });
}

async function submitWith(
  deps: ReturnType<typeof setup>,
  file: { url: string; filename: string },
) {
  await deps.formSubmissionRepository.save(
    FormSubmission.create({
      id: crypto.randomUUID(),
      tenantId,
      siteId: 'site-1',
      pageId: null,
      formId,
      payload: { name: 'Ada', cv: file },
    }),
  );
}

describe('sweepFormAttachments', () => {
  it('removes a file no submission names, and keeps the one a submission does', async () => {
    const deps = setup();
    const sent = await uploadAt(deps, dayBefore, 'sent.pdf');
    const abandoned = await uploadAt(deps, dayBefore, 'abandoned.pdf');
    await submitWith(deps, sent);

    const result = await sweepFormAttachments(deps, {
      tenantId,
      storedBefore: cutOff,
    });

    expect(result).toEqual({ deleted: 1 });
    expect(deps.attachmentStorage.urls()).toEqual([sent.url]);
    expect(deps.attachmentStorage.urls()).not.toContain(abandoned.url);
  });

  it('leaves a fresh upload alone: its submission may still be on its way', async () => {
    const deps = setup();
    const inFlight = await uploadAt(deps, aMomentAgo);

    await sweepFormAttachments(deps, { tenantId, storedBefore: cutOff });

    expect(deps.attachmentStorage.urls()).toEqual([inFlight.url]);
  });

  it('removes the file of a submission that retention has deleted', async () => {
    const deps = setup();
    const cv = await uploadAt(deps, yesterday);
    // No submission names it any more: retention took the answer.

    await sweepFormAttachments(deps, { tenantId, storedBefore: cutOff });

    expect(deps.attachmentStorage.urls()).not.toContain(cv.url);
  });

  it('keeps a file a submission names by the address the site had before it moved', async () => {
    const deps = setup();
    const cv = await uploadAt(deps, dayBefore);
    await submitWith(deps, {
      url: cv.url.replace(
        'https://files.esempio.test',
        'https://vecchio-dominio.example',
      ),
      filename: 'cv.pdf',
    });

    await sweepFormAttachments(deps, { tenantId, storedBefore: cutOff });

    expect(deps.attachmentStorage.urls()).toEqual([cv.url]);
  });
});
