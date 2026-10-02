import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSiteRecord } from '@kometio/testing/records';
import { DEFAULT_COOKIE_BANNER_SETTINGS } from '@kometio/shared-types';
import type { UserRole } from '@kometio/shared-types';
import type { DashboardStatsDto } from '../../lib/dashboard-api-client';
import { sessionAs } from '../../test/current-session.test-fixture';
import { useCurrentSession } from '../auth/use-current-session';
import { DashboardView } from './dashboard-view';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (await import('../../test/router-link.test-fixture')).StubLink,
}));

const readySite = buildSiteRecord({
  name: 'Forno Esempio',
  domain: 'forno.esempio.test',
  searchEngineIndexingEnabled: true,
  cookieBannerSettings: { ...DEFAULT_COOKIE_BANNER_SETTINGS, enabled: true },
});

function stats(overrides: Partial<DashboardStatsDto> = {}): DashboardStatsDto {
  return {
    pages: { publishedCount: 2, draftCount: 1 },
    media: { count: 5, totalSizeBytes: 2_621_440 },
    forms: {
      totalCount: 7,
      recentCount: 3,
      recent: [
        {
          formId: 'form-1',
          formName: 'Contatti',
          receivedAt: '2026-09-29T09:00:00.000Z',
        },
      ],
    },
    recentActivity: [
      {
        pageGroupId: 'group-1',
        pageTranslationId: 'tr-1',
        locale: 'it',
        title: 'Chi siamo',
        slug: 'chi-siamo',
        status: 'published',
        hasUnpublishedChanges: false,
        updatedAt: '2026-09-30T08:00:00.000Z',
      },
      {
        pageGroupId: 'group-2',
        pageTranslationId: 'tr-2',
        locale: 'it',
        title: 'Bozza nuova',
        slug: 'bozza',
        status: 'draft',
        hasUnpublishedChanges: false,
        updatedAt: '2026-09-28T08:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function renderDashboard(
  props: Partial<Parameters<typeof DashboardView>[0]> = {},
  role: UserRole = 'admin',
) {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs(role));
  return render(
    <DashboardView stats={stats()} site={readySite} formCount={1} {...props} />,
  );
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('the header', () => {
    it('says which site this is and where it is online', () => {
      renderDashboard();

      expect(
        screen.getByText('Forno Esempio · online su forno.esempio.test'),
      ).toBeTruthy();
    });

    it('says the site is not online yet when it has no domain', () => {
      renderDashboard({ site: { ...readySite, domain: null } });

      expect(
        screen.getByText('Forno Esempio · non ancora online'),
      ).toBeTruthy();
    });
  });

  describe('the launch checklist', () => {
    const notReady = buildSiteRecord({
      name: 'Forno Esempio',
      domain: null,
      searchEngineIndexingEnabled: false,
      cookieBannerSettings: {
        ...DEFAULT_COOKIE_BANNER_SETTINGS,
        enabled: false,
      },
    });

    it('lists what is missing, with the button that goes and does it, and says how far along the site is', () => {
      renderDashboard({
        site: notReady,
        stats: stats({ pages: { publishedCount: 0, draftCount: 1 } }),
      });

      expect(
        screen.getByRole('heading', { name: 'Prima di andare online' }),
      ).toBeTruthy();
      // Only the name is done.
      expect(screen.getByText('1 di 5')).toBeTruthy();
      expect(
        screen
          .getByRole('progressbar', { name: 'Prima di andare online' })
          .getAttribute('aria-valuenow'),
      ).toBe('1');
      expect(
        screen
          .getByRole('link', { name: 'Vai alle pagine' })
          .getAttribute('href'),
      ).toBe('/pages');
      expect(
        screen.getByRole('link', { name: 'Configura' }).getAttribute('href'),
      ).toBe('/settings/cookies');
      expect(
        screen.getByRole('link', { name: 'Vai a SEO' }).getAttribute('href'),
      ).toBe('/settings/seo');
      // The domain, not the name: its button goes to General.
      expect(
        screen.getByRole('link', { name: 'Imposta' }).getAttribute('href'),
      ).toBe('/settings/general');
      // The items are one list, named by the title above them.
      expect(
        within(
          screen.getByRole('list', { name: 'Prima di andare online' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(5);
    });

    it('says in words which are done and which are not, and gives a done one no button', () => {
      renderDashboard({
        site: notReady,
        stats: stats({ pages: { publishedCount: 0, draftCount: 1 } }),
      });

      const name = screen.getByText('Dai un nome al sito').closest('li');
      const domain = screen.getByText('Imposta il dominio').closest('li');
      expect(name && within(name).getByText('Fatto')).toBeTruthy();
      expect(name && within(name).queryByRole('link')).toBeNull();
      expect(domain && within(domain).getByText('Da fare')).toBeTruthy();
      expect(domain && within(domain).getByRole('link')).toBeTruthy();
    });

    // The same fault as on Integrations, on the line that already sent the
    // person to the banner.
    it('says when scripts are waiting for the banner that is off, on its line', () => {
      const script = {
        id: 's1',
        label: 'Google Analytics',
        category: 'measurement' as const,
        placement: 'head' as const,
        html: '<script></script>',
      };
      renderDashboard({
        site: {
          ...notReady,
          themeTrackerScripts: [script, { ...script, id: 's2' }],
        },
      });

      expect(
        screen.getByText(
          '2 script aspettano il consenso, ma il banner cookie è spento',
        ),
      ).toBeTruthy();
      expect(
        screen
          .getByRole('link', { name: 'Attiva il banner' })
          .getAttribute('href'),
      ).toBe('/settings/cookies');
      // Not a sixth line: it is the banner's own.
      expect(screen.queryByText('Attiva il banner cookie')).toBeNull();
    });

    it('is gone once every item is done', () => {
      renderDashboard();

      expect(
        screen.queryByRole('heading', { name: 'Prima di andare online' }),
      ).toBeNull();
    });

    // Every item is a setting an editor cannot change, so a list of buttons
    // that would send them back here is not offered to them.
    it.each(['editor', 'publisher'] as const)(
      'is not shown to a %s, who could not do what it asks',
      (role) => {
        renderDashboard({ site: notReady }, role);

        expect(
          screen.queryByRole('heading', { name: 'Prima di andare online' }),
        ).toBeNull();
      },
    );
  });

  describe('the numbers', () => {
    it('is a link to each list it counts, with the number as a number', () => {
      renderDashboard();

      const pages = screen.getByRole('link', { name: /^Pagine/ });
      expect(pages.getAttribute('href')).toBe('/pages');
      expect(within(pages).getByText('3')).toBeTruthy();
      expect(within(pages).getByText('2 pubblicate, 1 in bozza')).toBeTruthy();

      const media = screen.getByRole('link', { name: /^Media/ });
      expect(media.getAttribute('href')).toBe('/media');
      expect(within(media).getByText('5')).toBeTruthy();
      expect(within(media).getByText('2.5 MB')).toBeTruthy();

      const submissions = screen.getByRole('link', { name: /^Risposte/ });
      expect(submissions.getAttribute('href')).toBe('/forms');
      expect(within(submissions).getByText('7')).toBeTruthy();
      expect(
        within(submissions).getByText('3 negli ultimi 7 giorni'),
      ).toBeTruthy();
    });
  });

  describe('a site with no forms', () => {
    it('offers to make one instead of showing a zero', () => {
      renderDashboard({
        formCount: 0,
        stats: stats({
          forms: { totalCount: 0, recentCount: 0, recent: [] },
        }),
      });

      expect(
        screen
          .getByRole('link', { name: 'Crea un modulo' })
          .getAttribute('href'),
      ).toBe('/forms?page=1&new=true');
      // Not a link to a list with nothing in it.
      expect(screen.queryByRole('link', { name: /^Risposte/ })).toBeNull();
    });

    it('keeps the count for a site whose forms have not been answered yet', () => {
      renderDashboard({
        formCount: 2,
        stats: stats({
          forms: { totalCount: 0, recentCount: 0, recent: [] },
        }),
      });

      expect(screen.queryByRole('link', { name: 'Crea un modulo' })).toBeNull();
      expect(screen.getByRole('link', { name: /^Risposte/ })).toBeTruthy();
    });

    it('does not offer it to a role that may not make a form', () => {
      renderDashboard({ formCount: 0 }, 'editor');

      expect(screen.queryByRole('link', { name: 'Crea un modulo' })).toBeNull();
    });
  });

  describe('the recent activity', () => {
    it('puts pages and submissions in one list, the newest first, each linking to its own', () => {
      renderDashboard();

      const rows = screen
        .getAllByRole('listitem')
        .filter((row) => row.querySelector('time'));
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Chi siamo'),
        expect.stringContaining('Contatti'),
        expect.stringContaining('Bozza nuova'),
      ]);
      expect(within(rows[0]).getByRole('link').getAttribute('href')).toBe(
        '/page-groups/group-1',
      );
      // To the answers, not to the form's fields.
      expect(within(rows[1]).getByRole('link').getAttribute('href')).toBe(
        '/forms/form-1?tab=submissions&page=1',
      );
    });

    it('marks a page with its state and a submission as new, in words', () => {
      renderDashboard();

      const rows = screen
        .getAllByRole('listitem')
        .filter((row) => row.querySelector('time'));
      expect(within(rows[0]).getByText('Pubblicata')).toBeTruthy();
      expect(within(rows[1]).getByText('1 nuova risposta')).toBeTruthy();
      expect(within(rows[2]).getByText('Bozza')).toBeTruthy();
    });

    // Twelve answers in a morning are one row, not twelve.
    it('says how many answers one form received in a day, in one row', () => {
      renderDashboard({
        stats: stats({
          forms: {
            totalCount: 9,
            recentCount: 3,
            recent: [
              {
                formId: 'form-1',
                formName: 'Contatti',
                receivedAt: '2026-09-29T09:00:00',
              },
              {
                formId: 'form-1',
                formName: 'Contatti',
                receivedAt: '2026-09-29T10:00:00',
              },
              {
                formId: 'form-1',
                formName: 'Contatti',
                receivedAt: '2026-09-29T11:00:00',
              },
            ],
          },
        }),
      });

      expect(screen.getAllByText('Contatti')).toHaveLength(1);
      expect(screen.getByText('3 nuove risposte')).toBeTruthy();
    });

    it('says a page online with changes waiting is not simply published', () => {
      renderDashboard({
        stats: stats({
          recentActivity: [
            {
              pageGroupId: 'group-1',
              pageTranslationId: 'tr-1',
              locale: 'it',
              title: 'Chi siamo',
              slug: 'chi-siamo',
              status: 'published' as const,
              hasUnpublishedChanges: true,
              updatedAt: '2026-09-30T08:00:00.000Z',
            },
            {
              pageGroupId: 'group-2',
              pageTranslationId: 'tr-2',
              locale: 'it',
              title: 'Contatti',
              slug: 'contatti',
              status: 'published' as const,
              hasUnpublishedChanges: false,
              updatedAt: '2026-09-29T08:00:00.000Z',
            },
          ],
        }),
      });

      // The same words as the pages list: one page, one name.
      expect(screen.getByText('Modifiche non pubblicate')).toBeTruthy();
      expect(screen.getByText('Pubblicata')).toBeTruthy();
    });

    it('shows at most eight', () => {
      renderDashboard({
        stats: stats({
          recentActivity: Array.from({ length: 12 }, (_, index) => ({
            pageGroupId: `group-${index}`,
            pageTranslationId: `tr-${index}`,
            locale: 'it',
            title: `Pagina ${index}`,
            slug: `pagina-${index}`,
            status: 'published' as const,
            hasUnpublishedChanges: false,
            updatedAt: `2026-09-${10 + index}T08:00:00.000Z`,
          })),
        }),
      });

      expect(
        screen
          .getAllByRole('listitem')
          .filter((row) => row.querySelector('time')),
      ).toHaveLength(8);
    });

    it('says there is nothing yet, with a way to start, on a site with no pages and no submissions', () => {
      renderDashboard({
        stats: stats({
          pages: { publishedCount: 0, draftCount: 0 },
          forms: { totalCount: 0, recentCount: 0, recent: [] },
          recentActivity: [],
        }),
      });

      expect(screen.getByText(/non ha ancora pagine o media/)).toBeTruthy();
      const buttons = screen.getAllByRole('link', { name: 'Nuova pagina' });
      // The header's, and the one that starts from the empty list.
      expect(buttons).toHaveLength(2);
    });

    it('says only that nothing was edited lately when the site has pages', () => {
      renderDashboard({
        stats: stats({
          recentActivity: [],
          forms: { totalCount: 0, recentCount: 0, recent: [] },
        }),
      });

      expect(screen.getByText('Ancora nessuna modifica.')).toBeTruthy();
    });
  });
});
