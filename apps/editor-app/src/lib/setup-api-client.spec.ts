import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './http-client';
import { importSiteArchive } from './setup-api-client';

/** Just enough of XMLHttpRequest for the upload: what was asked of it, and a way to answer. */
class FakeUpload {
  static last: FakeUpload;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = undefined;
  status = 0;
  responseText = '';
  upload: {
    onprogress:
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeUpload.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  answer(status: number, responseText = '') {
    this.status = status;
    this.responseText = responseText;
    this.onload?.();
  }
}

describe('importSiteArchive', () => {
  const file = new File(['the archive'], 'site.tar.gz');

  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeUpload);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the file itself as the body, as a gzip, with the token in a header', () => {
    void importSiteArchive({
      file,
      setupToken: 'the-token',
      onProgress: vi.fn(),
    });

    const sent = FakeUpload.last;
    expect(sent.method).toBe('POST');
    expect(sent.url).toMatch(/\/setup\/import$/);
    expect(sent.headers).toEqual({
      'Content-Type': 'application/gzip',
      'X-Setup-Token': 'the-token',
    });
    // The file, not a copy of it in memory: the browser reads it as it goes.
    expect(sent.body).toBe(file);
  });

  it('says how much has been sent', () => {
    const onProgress = vi.fn();
    void importSiteArchive({ file, setupToken: 't', onProgress });

    FakeUpload.last.upload.onprogress?.({
      lengthComputable: true,
      loaded: 5,
      total: 11,
    });
    FakeUpload.last.upload.onprogress?.({
      lengthComputable: false,
      loaded: 9,
      total: 0,
    });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(5, 11);
  });

  it('resolves when the server has accepted it', async () => {
    const done = importSiteArchive({
      file,
      setupToken: 't',
      onProgress: vi.fn(),
    });

    FakeUpload.last.answer(202, JSON.stringify({ accepted: true }));

    await expect(done).resolves.toBeUndefined();
  });

  it('rejects with what the server said, as the editor reads every refusal', async () => {
    const done = importSiteArchive({
      file,
      setupToken: 't',
      onProgress: vi.fn(),
    });

    FakeUpload.last.answer(400, JSON.stringify({ message: 'not an archive' }));

    await expect(done).rejects.toBeInstanceOf(ApiError);
    await expect(done).rejects.toMatchObject({
      status: 400,
      displayMessage: 'not an archive',
    });
  });

  it('rejects with the status alone when the answer is not JSON', async () => {
    const done = importSiteArchive({
      file,
      setupToken: 't',
      onProgress: vi.fn(),
    });

    FakeUpload.last.answer(502, '<html>Bad gateway</html>');

    await expect(done).rejects.toMatchObject({
      status: 502,
      displayMessage: null,
    });
  });

  it('rejects when the connection fails or is cut', async () => {
    const failing = importSiteArchive({
      file,
      setupToken: 't',
      onProgress: vi.fn(),
    });
    FakeUpload.last.onerror?.();
    await expect(failing).rejects.toThrow('could not be made');

    const cut = importSiteArchive({
      file,
      setupToken: 't',
      onProgress: vi.fn(),
    });
    FakeUpload.last.onabort?.();
    await expect(cut).rejects.toThrow('cancelled');
  });
});
