import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import * as router from '@tanstack/react-router';
import {
  buildPageGroupListItemRecord,
  buildPageTranslationRecord,
  buildSiteLayoutSectionRecord,
  buildSiteLayoutSectionVersionRecord,
} from '@kometio/testing/records';
import * as sectionsApi from '../../lib/site-layout-sections-api-client';
import type { SiteLayoutSectionRecord } from '../../lib/site-layout-sections-api-client';
import * as pageGroupsApi from '../../lib/page-groups-api-client';
import * as previewTokenApi from '../../lib/preview-token-api-client';
import { TooltipProvider } from '../../components/ui/tooltip';
import type { Block } from '@kometio/shared-types';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import {
  findCanvasIframe,
  markCanvasReady,
  selectBlockWithRect,
} from '../../test/preview-bridge.test-fixture';
import * as blockFragmentApi from '../../lib/block-fragment-api-client';
import {
  pageGroupsQueryOptions,
  pageGroupTranslationsQueryOptions,
} from '../pages/page-groups-queries';
import { siteLayoutSectionQueryOptions } from './site-layout-sections-queries';
import { SiteLayoutSectionEditorView } from './site-layout-section-editor-view';
import { ToastProvider } from '../shell/toast-provider';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise: what each role is offered is
// decided by the permissions table, and tested where it is decided.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
    useNavigate: vi.fn(),
  };
});

vi.mock('../../lib/site-layout-sections-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/site-layout-sections-api-client')
    >();
  return {
    ...actual,
    listVersions: vi.fn(),
    rollbackToVersion: vi.fn(),
    updateSticky: vi.fn(),
    saveDraft: vi.fn(),
  };
});

vi.mock('../../lib/block-fragment-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../lib/block-fragment-api-client')
    >();
  return { ...actual, renderBlockFragment: vi.fn() };
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    listPageGroups: vi.fn(),
    listPageGroupTranslations: vi.fn(),
  };
});

// CanvasEditorShell/CanvasFrame mint a real preview token on mount — mocked
// here so these tests never make a real network call to apps/api.
vi.mock('../../lib/preview-token-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/preview-token-api-client')>();
  return { ...actual, createTranslationPreviewToken: vi.fn() };
});

const representativeGroup = buildPageGroupListItemRecord();

const representativeTranslation = buildPageTranslationRecord();

const sampleSection = buildSiteLayoutSectionRecord();

function renderView(
  kind: SiteLayoutSectionRecord['kind'] = 'header',
  hasRepresentativePage = true,
  content: Block[] = [],
  enabledLocales: string[] = ['it'],
) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    siteLayoutSectionQueryOptions('site-1', 'it', kind).queryKey,
    { ...sampleSection, kind, content },
  );
  // Pre-seeded, same reasoning as siteLayoutSectionQueryOptions above — lets
  // these tests assert synchronously instead of awaiting the representative-
  // page fetch on every single one of them.
  queryClient.setQueryData(
    pageGroupsQueryOptions('site-1', 1, { locale: 'it' }).queryKey,
    {
      items: hasRepresentativePage ? [representativeGroup] : [],
      total: hasRepresentativePage ? 1 : 0,
    },
  );
  if (hasRepresentativePage) {
    queryClient.setQueryData(
      pageGroupTranslationsQueryOptions('group-1').queryKey,
      [representativeTranslation],
    );
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <SiteLayoutSectionEditorView
            siteId="site-1"
            locale="it"
            enabledLocales={enabledLocales}
            kind={kind}
          />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('SiteLayoutSectionEditorView', () => {
  beforeEach(() => {
    vi.mocked(pageGroupsApi.listPageGroups).mockResolvedValue({
      items: [representativeGroup],
      total: 1,
    });
    vi.mocked(pageGroupsApi.listPageGroupTranslations).mockResolvedValue([
      representativeTranslation,
    ]);
    vi.mocked(previewTokenApi.createTranslationPreviewToken).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a friendly empty state instead of the canvas when no page exists in this locale yet', () => {
    renderView('header', false);

    expect(
      screen.getByText(/crea prima una pagina in questa lingua/i),
    ).toBeTruthy();
  });

  it('renders a link back to Header e footer, on the same language, that does not wrap', () => {
    renderView();

    const link = screen.getByRole('link', { name: /header e footer/i });
    expect(link.getAttribute('href')).toBe('/layout?locale=it');
    expect(link.className).toContain('whitespace-nowrap');
  });

  // The bar named nothing but the way back: what was being edited, and in
  // which language, was not written anywhere in the editor.
  it('names what is being edited, and in which language', () => {
    renderView();

    expect(screen.getByText('Header · IT')).toBeTruthy();
  });

  it('says whether visitors see it at all, as the page editor does', () => {
    renderView();
    // A header never published is not on the site yet.
    expect(screen.getByText('Bozza')).toBeTruthy();
  });

  describe('the languages', () => {
    it('offers to move to another language of the same header, when the site has several', async () => {
      const navigate = vi.fn();
      vi.mocked(router.useNavigate).mockReturnValue(navigate);
      renderView('header', true, [], ['it', 'en']);

      fireEvent.click(screen.getByRole('button', { name: /^it/i }));
      fireEvent.click(await screen.findByRole('button', { name: /^en/i }));

      expect(navigate).toHaveBeenCalledWith({
        to: '/layout/header',
        search: { locale: 'en' },
      });
    });

    it('goes to the footer of the other language from the footer', async () => {
      const navigate = vi.fn();
      vi.mocked(router.useNavigate).mockReturnValue(navigate);
      renderView('footer', true, [], ['it', 'en']);

      fireEvent.click(screen.getByRole('button', { name: /^it/i }));
      fireEvent.click(await screen.findByRole('button', { name: /^en/i }));

      expect(navigate).toHaveBeenCalledWith({
        to: '/layout/footer',
        search: { locale: 'en' },
      });
    });

    it('offers no switch on a site with one language', () => {
      renderView();

      expect(screen.queryByRole('button', { name: /^it/i })).toBeNull();
    });
  });

  describe('what is being edited', () => {
    it('says the rest of the page is only there as an example', async () => {
      renderView();

      markCanvasReady(await findCanvasIframe());

      expect(
        await screen.findByText(
          'Pagina d’esempio — qui si modifica solo l’header',
        ),
      ).toBeTruthy();
    });

    it('offers to add the first block of an empty header, in the strip where it will be', async () => {
      renderView();

      markCanvasReady(await findCanvasIframe());

      expect(await screen.findByText('Header vuoto')).toBeTruthy();
    });

    it('does not call a header with blocks in it empty', async () => {
      renderView('header', true, [
        { id: 'link-1', type: 'NavLink', props: { label: 'Chi siamo' } },
      ]);

      markCanvasReady(await findCanvasIframe());

      await screen.findByText(/qui si modifica solo/);
      expect(screen.queryByText('Header vuoto')).toBeNull();
    });
  });

  it('opens the version history dialog and lists past versions newest-first', async () => {
    vi.mocked(sectionsApi.listVersions).mockResolvedValue([
      buildSiteLayoutSectionVersionRecord({
        id: 'v1',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      buildSiteLayoutSectionVersionRecord({
        id: 'v2',
        createdAt: '2026-01-02T00:00:00.000Z',
      }),
    ]);

    renderView();
    fireEvent.click(
      screen.getByRole('button', { name: /cronologia versioni/i }),
    );

    await waitFor(() =>
      expect(sectionsApi.listVersions).toHaveBeenCalledWith('section-1'),
    );
    const restoreButtons = await screen.findAllByRole('button', {
      name: /^ripristina$/i,
    });
    expect(restoreButtons).toHaveLength(1);
    expect(screen.getByText(/versione attuale/i)).toBeTruthy();
  });

  /*
   * A restore waits for the saves already queued, and a change still in the
   * canvas's debounce is not queued yet: sent after the rollback, it put
   * back the header the restore had just replaced. The history is opened
   * before the edit here, so that nothing — not even the dialog loading
   * its versions — stands between the keystroke and the restore.
   *
   * The whole view, its canvas and a dialog take more than the default
   * five seconds on a busy machine; the order it checks does not depend
   * on time.
   */
  it('sends a change still inside the debounce before it restores a version', async () => {
    const order: string[] = [];
    vi.mocked(sectionsApi.saveDraft).mockImplementation(
      async (_id, content) => {
        order.push('save');
        return { ...sampleSection, content };
      },
    );
    vi.mocked(sectionsApi.rollbackToVersion).mockImplementation(async () => {
      order.push('rollback');
      return sampleSection;
    });
    vi.mocked(sectionsApi.listVersions).mockResolvedValue([
      buildSiteLayoutSectionVersionRecord({
        id: 'v1',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      buildSiteLayoutSectionVersionRecord({
        id: 'v2',
        createdAt: '2026-01-02T00:00:00.000Z',
      }),
    ]);
    vi.mocked(blockFragmentApi.renderBlockFragment).mockResolvedValue(
      '<a>Contatti</a>',
    );

    renderView('header', true, [
      { id: 'link-1', type: 'NavLink', props: { label: 'Chi siamo' } },
    ]);
    selectBlockWithRect(await findCanvasIframe(), 'link-1', {
      top: 0,
      left: 0,
      width: 200,
      height: 40,
    });
    fireEvent.click(
      screen.getByRole('button', { name: /cronologia versioni/i }),
    );
    const [restore] = await screen.findAllByRole('button', {
      name: /^ripristina$/i,
    });

    fireEvent.change(screen.getByDisplayValue('Chi siamo'), {
      target: { value: 'Contatti' },
    });
    fireEvent.click(restore);

    await waitFor(() => expect(order).toEqual(['save', 'rollback']));
    expect(sectionsApi.saveDraft).toHaveBeenCalledWith('section-1', [
      expect.objectContaining({
        id: 'link-1',
        props: expect.objectContaining({ label: 'Contatti' }),
      }),
    ]);
  }, 15_000);

  // "Stick while scrolling" sat alone in a bar above the canvas, without
  // saying of what. It is the header's setting, so it is with the header's
  // properties, named — where the panel is about the thing itself.
  it('has the sticky setting in the properties panel, named, and not in the bar', () => {
    renderView();

    expect(
      screen.getByRole('switch', { name: 'Fisso durante lo scorrimento' }),
    ).toBeTruthy();
    expect(screen.getByText('Impostazioni dell’header')).toBeTruthy();
  });

  it('shows the sticky toggle for a header and calls updateSticky when flipped', async () => {
    vi.mocked(sectionsApi.updateSticky).mockResolvedValue({
      ...sampleSection,
      sticky: true,
    });

    renderView();

    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(sectionsApi.updateSticky).toHaveBeenCalledWith('section-1', true),
    );
  });

  it('hides the sticky toggle for a footer — sticky is a header-only concept', () => {
    renderView('footer');

    expect(screen.queryByRole('switch')).toBeNull();
  });
});
