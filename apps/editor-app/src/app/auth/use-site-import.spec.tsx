import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/http-client';
import * as setupApi from '../../lib/setup-api-client';
import { asSentence, useSiteImport } from './use-site-import';

vi.mock('../../lib/setup-api-client', () => ({
  fetchSetupStatus: vi.fn(),
  importSiteArchive: vi.fn(),
}));

const archive = new File(['the archive'], 'site.tar.gz', {
  type: 'application/gzip',
});
const POLL_MS = 1500;

/** Lets the clock run for `ms`, and whatever the code under test awaited settle. */
async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useSiteImport', () => {
  const status = vi.mocked(setupApi.fetchSetupStatus);
  const upload = vi.mocked(setupApi.importSiteArchive);
  const away = () => status.mockRejectedValueOnce(new Error('Failed to fetch'));
  const notSetUp = { hasBeenSetUp: false, importFailure: null };

  beforeEach(() => {
    vi.useFakeTimers();
    upload.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * A hook with its import started. Never two `act`s at once: the import is
   * started in one, and the clock is moved in the next, by the test.
   */
  async function started(file: File = archive, token = 'the-token') {
    const onImported = vi.fn();
    const hook = renderHook(() => useSiteImport({ onImported }));
    await act(async () => {
      void hook.result.current.start(file, token);
      await vi.advanceTimersByTimeAsync(0);
    });
    return { ...hook, onImported };
  }

  const stateOf = (hook: { result: { current: { state: unknown } } }) =>
    hook.result.current.state;

  it('sends the file with the token, shows how far it has got, then waits for the server', async () => {
    let release: () => void = () => undefined;
    upload.mockImplementation(async ({ onProgress }) => {
      onProgress(5, 10);
      await new Promise<void>((resolve) => (release = resolve));
    });

    const hook = await started();

    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ file: archive, setupToken: 'the-token' }),
    );
    expect(stateOf(hook)).toEqual({ step: 'uploading', sent: 5, total: 10 });
    release();
    await elapse(0);
    expect(stateOf(hook)).toEqual({ step: 'opening' });
  });

  it('is done when the server comes back with the site that was in the archive', async () => {
    away();
    away();
    status.mockResolvedValue({ hasBeenSetUp: true, importFailure: null });

    const { onImported } = await started();
    await elapse(POLL_MS * 4);

    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('says why when the server comes back and the site did not come through', async () => {
    away();
    status.mockResolvedValue({
      hasBeenSetUp: false,
      importFailure: 'there is not enough room on the volume',
    });

    const hook = await started();
    await elapse(POLL_MS * 4);

    expect(stateOf(hook)).toEqual({
      step: 'failed',
      message: 'There is not enough room on the volume.',
      restarted: true,
    });
    expect(hook.onImported).not.toHaveBeenCalled();
  });

  it('gives up with a sentence of its own when the server is back, empty, and has said nothing', async () => {
    away();
    status.mockResolvedValue(notSetUp);

    const hook = await started();
    await elapse(POLL_MS * 4);

    expect(stateOf(hook)).toEqual({
      step: 'failed',
      message: expect.stringMatching(/il server non ha detto perché/),
      restarted: true,
    });
  });

  // Before the server has been seen to go away, "not set up" is the API that
  // took the upload, which has not stopped yet: not a failure.
  it('keeps waiting while the API that took the upload is still the one answering', async () => {
    status.mockResolvedValue(notSetUp);

    const hook = await started();
    await elapse(POLL_MS * 4);

    expect(stateOf(hook)).toEqual({ step: 'opening' });
  });

  it('gives up, in the end, on a server that never comes back', async () => {
    status.mockRejectedValue(new Error('Failed to fetch'));

    const hook = await started();
    await elapse(21 * 60 * 1000);

    expect(stateOf(hook)).toMatchObject({ step: 'failed' });
  });

  describe('when the archive is not accepted', () => {
    it('says the token is wrong, in the words of the wizard', async () => {
      upload.mockRejectedValue(new ApiError(401, { message: 'Invalid' }));

      const hook = await started(archive, 'a-guess');

      expect(stateOf(hook)).toEqual({
        step: 'failed',
        message: expect.stringMatching(/token di installazione/i),
        restarted: false,
      });
      expect(status).not.toHaveBeenCalled();
    });

    it('says what the server said was wrong with the archive', async () => {
      upload.mockRejectedValue(
        new ApiError(400, { message: 'this is not a Kometio site archive' }),
      );

      const hook = await started();

      expect(stateOf(hook)).toEqual({
        step: 'failed',
        message: 'This is not a Kometio site archive.',
        restarted: false,
      });
    });

    it('says the upload failed, for a connection that did', async () => {
      upload.mockRejectedValue(new Error('The upload could not be made'));

      const hook = await started();

      expect(stateOf(hook)).toEqual({
        step: 'failed',
        message: expect.stringMatching(/non è stato possibile inviare/i),
        restarted: false,
      });
    });
  });

  it('does nothing on behalf of a page that has been left', async () => {
    status.mockResolvedValue({ hasBeenSetUp: true, importFailure: null });

    const { onImported, unmount } = await started();
    unmount();
    await elapse(POLL_MS * 4);

    expect(onImported).not.toHaveBeenCalled();
  });
});

describe('asSentence', () => {
  it('writes the launcher’s sentence as the editor writes one', () => {
    expect(asSentence('this is not a Kometio site archive')).toBe(
      'This is not a Kometio site archive.',
    );
  });

  it('leaves a sentence that is already one alone', () => {
    expect(asSentence('Already a sentence.')).toBe('Already a sentence.');
    expect(asSentence('Is it?')).toBe('Is it?');
  });

  it('says nothing for nothing', () => {
    expect(asSentence('  ')).toBe('');
  });
});
