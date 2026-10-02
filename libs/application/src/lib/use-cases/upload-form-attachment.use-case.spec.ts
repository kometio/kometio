import {
  Form,
  FormNotFoundError,
  UnsupportedAttachmentTypeError,
} from '@kometio/domain-core';
import type {
  AttachmentStoragePort,
  UploadAttachmentInput,
} from '@kometio/ports';
import { InMemoryFormRepository } from '@kometio/testing';
import { describe, expect, it } from 'vitest';
import { uploadFormAttachment } from './upload-form-attachment.use-case';

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');

async function setUp() {
  const formRepository = new InMemoryFormRepository();
  await formRepository.add(
    Form.create({
      id: 'form-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      name: 'Contatti',
    }),
  );
  const uploads: UploadAttachmentInput[] = [];
  const attachmentStorage: AttachmentStoragePort = {
    upload: async (input) => {
      uploads.push(input);
      return {
        url: 'http://localhost/attachments/stored.pdf',
        filename: input.filename,
      };
    },
    urlPrefixFor: (formId) => `http://localhost/attachments/${formId}/`,
    // eslint-disable-next-line require-yield
    async *listStored() {
      return;
    },
    delete: async () => undefined,
  };
  return { deps: { formRepository, attachmentStorage }, uploads };
}

const input = {
  tenantId: 'tenant-1',
  formId: 'form-1',
  filename: 'cv.exe',
  declaredMimeType: 'application/x-msdownload',
  data: PDF,
};

describe('uploadFormAttachment', () => {
  it('stores what the bytes are, not what the client said they were', async () => {
    const { deps, uploads } = await setUp();

    const stored = await uploadFormAttachment(deps, input);

    expect(uploads).toEqual([
      {
        formId: 'form-1',
        filename: 'cv.exe',
        mimeType: 'application/pdf',
        extension: 'pdf',
        data: PDF,
      },
    ]);
    expect(stored.filename).toBe('cv.exe');
  });

  it('refuses a form that does not exist, before reading the file', async () => {
    const { deps, uploads } = await setUp();

    await expect(
      uploadFormAttachment(deps, { ...input, formId: 'nope' }),
    ).rejects.toBeInstanceOf(FormNotFoundError);
    expect(uploads).toEqual([]);
  });

  it('refuses bytes that are on no allow-list', async () => {
    const { deps, uploads } = await setUp();

    await expect(
      uploadFormAttachment(deps, {
        ...input,
        data: new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0x02]),
      }),
    ).rejects.toBeInstanceOf(UnsupportedAttachmentTypeError);
    expect(uploads).toEqual([]);
  });
});
