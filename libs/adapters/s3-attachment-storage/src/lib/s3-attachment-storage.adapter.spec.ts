import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3AttachmentStorageAdapter } from './s3-attachment-storage.adapter';

const sendMock = vi.fn();

// Same mocking approach as s3-media-storage's own spec — no real
// bucket/MinIO needed, assert on the command objects passed to send().
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(function S3ClientMock() {
      return { send: sendMock };
    }),
  };
});

const formId = '5b0a4c1e-7f3d-4e2a-9c61-2d8e4f1a3b70';

describe('S3AttachmentStorageAdapter', () => {
  let adapter: S3AttachmentStorageAdapter;

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
    adapter = new S3AttachmentStorageAdapter({
      bucket: 'kometio-attachments',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      publicBaseUrl: 'https://attachments.example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a non-image file as-is under an attachments/ key prefix', async () => {
    const data = new TextEncoder().encode('%PDF-1.4 fake pdf content');

    const result = await adapter.upload({
      formId,
      filename: 'cv.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      data,
    });

    expect(result.filename).toBe('cv.pdf');
    expect(result.url).toMatch(
      /^https:\/\/attachments\.example\.com\/attachments\/[\w-]+\/[\w-]+\.pdf$/,
    );
    expect(result.url.startsWith(adapter.urlPrefixFor(formId))).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command.input.Bucket).toBe('kometio-attachments');
    expect(command.input.Key).toMatch(
      new RegExp(`^attachments/${formId}/[\\w-]+\\.pdf$`),
    );
    expect(command.input.ContentType).toBe('application/pdf');
  });

  it('passes a custom endpoint and forcePathStyle through to the client (MinIO)', () => {
    vi.mocked(S3Client).mockClear();

    new S3AttachmentStorageAdapter({
      bucket: 'kometio-attachments',
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
      accessKeyId: 'x',
      secretAccessKey: 'y',
      publicBaseUrl: 'http://localhost:9000/kometio-attachments',
    });

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
      }),
    );
  });

  describe('listStored and delete', () => {
    const file = `attachments/${formId}/0f8fad5b-d9cb-469f-a165-70867728950e.pdf`;

    it('lists every page of what upload wrote, and nothing else under the prefix', async () => {
      const at = new Date('2026-09-28T09:00:00Z');
      sendMock
        .mockResolvedValueOnce({
          Contents: [
            { Key: file, LastModified: at },
            { Key: 'attachments/notes.txt', LastModified: at },
          ],
          NextContinuationToken: 'next',
        })
        .mockResolvedValueOnce({
          Contents: [
            {
              Key: 'attachments/8c1d7e5a-3b6f-4a2d-9e8c-1f2a3b4c5d6e.png',
              LastModified: at,
            },
          ],
        });

      const stored = [];
      for await (const one of adapter.listStored()) stored.push(one);

      expect(stored).toEqual([
        { url: `https://attachments.example.com/${file}`, storedAt: at },
        {
          url: 'https://attachments.example.com/attachments/8c1d7e5a-3b6f-4a2d-9e8c-1f2a3b4c5d6e.png',
          storedAt: at,
        },
      ]);
      const listCalls = sendMock.mock.calls.map(([command]) => command);
      expect(listCalls[0]).toBeInstanceOf(ListObjectsV2Command);
      expect(listCalls[1].input.ContinuationToken).toBe('next');
    });

    it('deletes by the key its url names', async () => {
      await adapter.delete(`https://attachments.example.com/${file}`);

      const [command] = sendMock.mock.calls[0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'kometio-attachments',
        Key: file,
      });
    });

    it('refuses a url that is not a file it stored', async () => {
      await expect(
        adapter.delete('https://attachments.example.com/media/logo.png'),
      ).rejects.toThrow('Not a stored attachment');
      expect(sendMock).not.toHaveBeenCalled();
    });
  });
});
