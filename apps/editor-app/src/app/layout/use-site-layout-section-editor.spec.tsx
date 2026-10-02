import type { ReactNode } from 'react';
import { act, renderHook, screen } from '@testing-library/react';
import { WithToasts } from '../../test/toasts.test-fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Block } from '@kometio/shared-types';
import * as api from '../../lib/site-layout-sections-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { buildSiteLayoutSectionRecord } from '@kometio/testing/records';
import { siteLayoutSectionQueryOptions } from './site-layout-sections-queries';
import { useSiteLayoutSectionEditor } from './use-site-layout-section-editor';

vi.mock('../../lib/site-layout-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/site-layout-sections-api-client')
    >();
  return {
    ...actual,
    saveDraft: vi.fn(),
    publishSiteLayoutSection: vi.fn(),
    updateSticky: vi.fn(),
  };
});

const sampleSection = buildSiteLayoutSectionRecord();

const sampleContent: Block[] = [{ id: 'nav-1', type: 'Nav', props: {} }];

// Pre-seeds the query cache so useSuspenseQuery resolves synchronously —
// same reasoning as usePageEditor's own tests.
function renderEditor() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    siteLayoutSectionQueryOptions('site-1', 'it', 'header').queryKey,
    sampleSection,
  );
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WithToasts>{children}</WithToasts>
      </QueryClientProvider>
    );
  }
  return renderHook(
    () => useSiteLayoutSectionEditor('site-1', 'it', 'header'),
    { wrapper },
  );
}

describe('useSiteLayoutSectionEditor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with the cached section and idle status', () => {
    const { result } = renderEditor();

    expect(result.current.section).toEqual(sampleSection);
    expect(result.current.status).toEqual({ kind: 'idle' });
  });

  it('handleChange saves the draft immediately — no debounce, canvas-editor-shell already debounces', async () => {
    vi.mocked(api.saveDraft).mockResolvedValue(sampleSection);

    const { result } = renderEditor();

    await act(async () => {
      result.current.handleChange(sampleContent);
    });

    expect(api.saveDraft).toHaveBeenCalledWith(sampleSection.id, sampleContent);
    // The time it landed travels with the status: the bar names it rather
    // than saying "Draft saved" for the rest of the session.
    expect(result.current.status).toMatchObject({ kind: 'saved' });
    expect(
      result.current.status.kind === 'saved' && result.current.status.at,
    ).toBeTypeOf('number');
  });

  it('handleChange sets an error status when the save fails', async () => {
    vi.mocked(api.saveDraft).mockRejectedValue(new Error('save failed'));

    const { result } = renderEditor();

    await act(async () => {
      result.current.handleChange(sampleContent);
    });

    expect(result.current.status).toEqual({
      kind: 'error',
      error: expect.objectContaining({ message: 'save failed' }),
    });
  });

  it('handlePublish saves the draft then publishes', async () => {
    vi.mocked(api.saveDraft).mockResolvedValue(sampleSection);
    vi.mocked(api.publishSiteLayoutSection).mockResolvedValue({
      ...sampleSection,
      status: 'published',
    });

    const { result } = renderEditor();

    await act(async () => {
      await result.current.handlePublish(sampleContent);
    });

    expect(api.saveDraft).toHaveBeenCalledWith(sampleSection.id, sampleContent);
    expect(api.publishSiteLayoutSection).toHaveBeenCalledWith(sampleSection.id);
    expect(result.current.status).toEqual({ kind: 'published' });
  });

  it('handleStickyChange calls updateSticky and refreshes the cached section', async () => {
    vi.mocked(api.updateSticky).mockResolvedValue({
      ...sampleSection,
      sticky: true,
    });

    const { result } = renderEditor();

    await act(async () => {
      result.current.handleStickyChange(true);
    });

    expect(api.updateSticky).toHaveBeenCalledWith(sampleSection.id, true);
    // The change is live at once, without a publish: said, not just flipped.
    expect(
      await screen.findByText(/resta in alto mentre si scorre/),
    ).toBeTruthy();
  });

  it('handleStickyChange sets an error status when the update fails', async () => {
    vi.mocked(api.updateSticky).mockRejectedValue(new Error('sticky failed'));

    const { result } = renderEditor();

    await act(async () => {
      result.current.handleStickyChange(true);
    });

    expect(result.current.status).toEqual({
      kind: 'error',
      error: expect.objectContaining({ message: 'sticky failed' }),
    });
  });

  /*
   * The queue these editors now share with the page editor
   * (useDraftEditor). Before it, every change fired its own request, so an
   * older save could land after a newer one and publishing did not wait
   * for the saves already on their way.
   */
  describe('the save queue', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    const newer: Block[] = [{ id: 'nav-2', type: 'Nav', props: {} }];

    it('never sends a second save while the first is still on its way', async () => {
      const first = deferred<typeof sampleSection>();
      vi.mocked(api.saveDraft)
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(sampleSection);
      const { result } = renderEditor();

      await act(async () => {
        result.current.handleChange(sampleContent);
        result.current.handleChange(newer);
      });
      expect(api.saveDraft).toHaveBeenCalledTimes(1);

      await act(async () => {
        first.resolve(sampleSection);
        await result.current.whenSaved();
      });
      expect(api.saveDraft).toHaveBeenCalledTimes(2);
      expect(api.saveDraft).toHaveBeenLastCalledWith(sampleSection.id, newer);
    });

    it('publishes only after the save already on its way has landed', async () => {
      const inFlight = deferred<typeof sampleSection>();
      vi.mocked(api.saveDraft)
        .mockReturnValueOnce(inFlight.promise)
        .mockResolvedValue(sampleSection);
      vi.mocked(api.publishSiteLayoutSection).mockResolvedValue({
        ...sampleSection,
        status: 'published',
      });
      const { result } = renderEditor();

      let publishing!: Promise<unknown>;
      await act(async () => {
        result.current.handleChange(sampleContent);
        publishing = result.current.handlePublish(newer);
      });
      expect(api.publishSiteLayoutSection).not.toHaveBeenCalled();

      await act(async () => {
        inFlight.resolve(sampleSection);
        await publishing;
      });
      expect(api.saveDraft).toHaveBeenLastCalledWith(sampleSection.id, newer);
      expect(api.publishSiteLayoutSection).toHaveBeenCalledTimes(1);
      expect(result.current.status).toEqual({ kind: 'published' });
    });

    it('does not publish a draft that failed to save', async () => {
      vi.mocked(api.saveDraft).mockRejectedValue(new Error('save failed'));
      const { result } = renderEditor();

      await act(async () => {
        await expect(
          result.current.handlePublish(sampleContent),
        ).rejects.toThrow();
      });

      expect(api.publishSiteLayoutSection).not.toHaveBeenCalled();
      expect(result.current.status).toMatchObject({ kind: 'error' });
    });

    it('whenSaved waits for the queue to drain', async () => {
      const inFlight = deferred<typeof sampleSection>();
      vi.mocked(api.saveDraft).mockReturnValueOnce(inFlight.promise);
      const { result } = renderEditor();
      let settled = false;

      await act(async () => {
        result.current.handleChange(sampleContent);
        void result.current.whenSaved().then(() => {
          settled = true;
        });
      });
      expect(settled).toBe(false);

      await act(async () => {
        inFlight.resolve(sampleSection);
      });
      expect(settled).toBe(true);
    });
  });
});
