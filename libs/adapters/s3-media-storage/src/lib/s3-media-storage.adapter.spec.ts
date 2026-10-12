import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { S3MediaStorageAdapter } from './s3-media-storage.adapter';

const sendMock = vi.fn();

// No real bucket/MinIO needed for these — the S3Client itself is mocked,
// so put()/delete() are verified by asserting on the command objects
// passed to send(), not by hitting a real endpoint.
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    // A plain function (not an arrow) so `new S3Client(...)` works — the
    // constructor's object return overrides `this`, same trick `vi.fn()`
    // itself can't do with an arrow-function implementation.
    S3Client: vi.fn().mockImplementation(function S3ClientMock() {
      return { send: sendMock };
    }),
  };
});

/*
 * What a file is, and what it may be served as, is the application's to
 * decide (store-upload.spec.ts). This adapter says how a bucket is told.
 */
describe('S3MediaStorageAdapter', () => {
  let adapter: S3MediaStorageAdapter;

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
    adapter = new S3MediaStorageAdapter({
      bucket: 'kometio-media',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      publicBaseUrl: 'https://media.example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('puts the bytes it is given under the key and the type it is given', async () => {
    const data = new Uint8Array([1, 2, 3]);

    await adapter.put({
      key: 'abc.webp',
      data,
      contentType: 'image/webp',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command.input.Bucket).toBe('kometio-media');
    expect(command.input.Key).toBe('abc.webp');
    expect(command.input.Body).toBe(data);
    expect(command.input.ContentType).toBe('image/webp');
    expect(command.input.ContentDisposition).toBeUndefined();
  });

  /*
   * The bucket serves these files itself, so the rule that they download
   * rather than open has to travel WITH the object — our API is not in the
   * path to add the header later.
   */
  it('stores a download with the header that makes it one', async () => {
    await adapter.put({
      key: 'files/1b4e28ba/pagina.html',
      data: new Uint8Array([1]),
      contentType: 'text/html',
      downloadName: 'pagina.html',
    });

    const command = sendMock.mock.calls[0][0];
    expect(command.input.ContentType).toBe('text/html');
    expect(command.input.ContentDisposition).toBe(
      'attachment; filename="pagina.html"',
    );
  });

  it('does not let a name close the quoted string or add a header', async () => {
    await adapter.put({
      key: 'files/1b4e28ba/x',
      data: new Uint8Array([1]),
      contentType: 'text/plain',
      downloadName: "a\"; filename*=UTF-8''evil.html\r\nX-Injected: 1",
    });

    const header: string = sendMock.mock.calls[0][0].input.ContentDisposition;
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toBe(
      'attachment; filename="a\\"; filename*=UTF-8\'\'evil.html X-Injected: 1"',
    );
  });

  it('exposes its provider as "s3"', () => {
    expect(adapter.provider).toBe('s3');
  });

  it('getUrl builds a URL under the configured public base', () => {
    expect(adapter.getUrl('abc.webp')).toBe(
      'https://media.example.com/abc.webp',
    );
  });

  it('delete sends a DeleteObjectCommand for the bucket/key, and never throws for a missing key', async () => {
    await adapter.delete('abc.webp');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command.input.Bucket).toBe('kometio-media');
    expect(command.input.Key).toBe('abc.webp');
  });

  it('passes a custom endpoint and forcePathStyle through to the client (MinIO)', () => {
    vi.mocked(S3Client).mockClear();

    new S3MediaStorageAdapter({
      bucket: 'kometio-media',
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
      accessKeyId: 'x',
      secretAccessKey: 'y',
      publicBaseUrl: 'http://localhost:9000/kometio-media',
    });

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
      }),
    );
  });
});
