import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@kometio/shared-types';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';
import { chooseOption } from '../../test/select.test-fixture';
import { useServerFeatures } from '../common/deployment-queries';
import { useIsNarrow } from '../common/use-is-narrow';
import { SettingsNav } from './settings-nav';

const { navigate, location } = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/settings/seo' },
}));

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));
vi.mock('../common/use-is-narrow', () => ({ useIsNarrow: vi.fn() }));
vi.mock('../common/deployment-queries', () => ({ useServerFeatures: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (await import('../../test/router-link.test-fixture')).StubLink,
    useNavigate: () => navigate,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => string;
    }) => select({ location }),
  };
});

function renderNav(role: UserRole = 'admin') {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs(role));
  return render(<SettingsNav />);
}

describe('SettingsNav', () => {
  beforeEach(() => {
    vi.mocked(useIsNarrow).mockReturnValue(false);
    vi.mocked(useServerFeatures).mockReturnValue({ siteArchive: false });
    location.pathname = '/settings/seo';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists every section by name, in groups, each a link of its own', () => {
    renderNav('admin');

    const menu = screen.getByRole('navigation', {
      name: 'Sezioni delle impostazioni',
    });
    expect(
      within(menu)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Sito', 'Collegamenti', 'Privacy e accessi']);
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Generali', '/settings/general'],
      ['Lingue', '/settings/languages'],
      ['SEO', '/settings/seo'],
      ['Dati attività', '/settings/business'],
      ['Collezioni', '/settings/collections'],
      ['Integrazioni', '/settings/integrations'],
      ['Generazione AI', '/settings/ai'],
      ['Cookie e privacy', '/settings/cookies'],
      ['Conservazione dati', '/settings/retention'],
      ['Utenti', '/settings/users'],
    ]);
  });

  // The collections go live without a publish (docs/roles.md), which makes
  // them the one section a publisher owns; nothing else is theirs to open.
  it('offers a publisher the collections and no group that would be empty', () => {
    renderNav('publisher');

    const menu = screen.getByRole('navigation', {
      name: 'Sezioni delle impostazioni',
    });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Collezioni']);
    expect(
      within(menu)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Sito']);
  });

  // It depends on what the server can do as well as on the role: the single
  // image makes the archive, and a deployment with a database of its own cannot.
  describe('the export', () => {
    const linksOf = () =>
      within(
        screen.getByRole('navigation', { name: 'Sezioni delle impostazioni' }),
      )
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]);

    it('is offered to an administrator on a server that can make it, last, with the privacy sections', () => {
      vi.mocked(useServerFeatures).mockReturnValue({ siteArchive: true });

      renderNav('admin');

      expect(linksOf().at(-1)).toEqual(['Esporta', '/settings/export']);
    });

    it('is not offered where the server cannot make it', () => {
      renderNav('admin');

      expect(linksOf().map(([name]) => name)).not.toContain('Esporta');
    });

    it('is not offered to a publisher, whatever the server can do', () => {
      vi.mocked(useServerFeatures).mockReturnValue({ siteArchive: true });

      renderNav('publisher');

      expect(linksOf().map(([name]) => name)).toEqual(['Collezioni']);
    });
  });

  describe('on a phone', () => {
    beforeEach(() => {
      vi.mocked(useIsNarrow).mockReturnValue(true);
    });

    it('is a select that shows where you are and goes where you choose', () => {
      renderNav('admin');

      const select = screen.getByRole('combobox', {
        name: 'Sezione delle impostazioni',
      });
      expect(select.textContent).toBe('SEO');
      chooseOption(select, 'Integrazioni');

      expect(navigate).toHaveBeenCalledWith({ to: '/settings/integrations' });
    });

    it('takes a sub-page for the section it belongs to', () => {
      location.pathname = '/settings/cookies/legal-documents';

      renderNav('admin');

      expect(
        screen.getByRole('combobox', { name: 'Sezione delle impostazioni' })
          .textContent,
      ).toBe('Cookie e privacy');
      expect(screen.queryByRole('navigation')).toBeNull();
    });
  });

  it('is not a select on a wide screen', () => {
    renderNav('admin');

    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
