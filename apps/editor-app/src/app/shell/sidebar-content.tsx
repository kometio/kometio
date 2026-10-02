import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, PanelLeftClose, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AccountMenu } from '../account/account-menu';
import { Button } from '../../components/ui/button';
import { formatShortcut } from '../common/format-shortcut';
import { IconButton } from '../common/icon-button';
import { SearchTrigger } from '../common/search-trigger';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { siteQueryOptions } from '../settings/site-queries';
import { KometioMark } from './kometio-mark';
import { NavLink } from './nav-link';
import { useSidebarModel, type SidebarLink } from './use-sidebar-model';

/**
 * One entry in the sidebar: a list item around the shared link (see
 * NavLink for how "where you are" is drawn).
 */
function NavItem({
  to,
  params,
  icon,
  label,
}: {
  to: string;
  params?: Record<string, string>;
  icon: LucideIcon;
  label: string;
}) {
  return (
    // One entry, one list item — see NavGroup on why the group is a list.
    <li className="contents">
      <NavLink to={to} params={params} icon={icon}>
        {label}
      </NavLink>
    </li>
  );
}

/**
 * A heading and the entries under it.
 *
 * `<ul>` under a heading rather than a run of links: the sidebar has
 * fifteen destinations in it, and a screen reader was being read them as
 * one undifferentiated list.
 */
function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {/* A real list, not a run of links: the heading alone told a screen
          reader where a group started and nothing about how many
          destinations were in it. The `contents` display keeps the layout
          exactly as the flex column above draws it. */}
      <ul className="contents">{children}</ul>
    </div>
  );
}

/**
 * Which site this editor is open on: its name, the address it is served
 * on, and a way to go and look at it. Nothing in the shell said so, and
 * with more than one deployment open in tabs there was no telling them
 * apart.
 */
function SiteBlock() {
  const { t } = useTranslation();
  const { data: site } = useQuery(siteQueryOptions());

  if (!site) return null;
  return (
    <div className="flex items-start justify-between gap-1 px-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{site.name}</span>
        {/* Said, not left blank: a site with no domain is not reachable
            under its own name yet, which is what Settings is for. */}
        <span className="truncate text-xs text-muted-foreground">
          {site.domain ?? t('shell.site.domainMissing')}
        </span>
      </div>
      <IconButton
        asChild
        size="icon-sm"
        label={t('shell.site.open', { name: site.name })}
      >
        <a href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink />
        </a>
      </IconButton>
    </div>
  );
}

/**
 * What the sidebar holds: the mark, the site it is open on, what you work
 * on every day (the content, and how the site looks), and at the foot the
 * settings and the account menu.
 *
 * The sidebar is only the daily work: whatever is set up once — the
 * languages, the domain, the integrations, who may sign in — is one entry,
 * Settings, with its own area behind it. Twelve flat entries and a popover
 * of six more, with no readable criterion between them, is what this
 * replaced.
 *
 * Its own component because it is drawn in two places — the sidebar on a
 * wide screen, and the menu that slides in on a narrow one. One copy each
 * would be two navigations that could disagree about which screens exist.
 * The strip it folds into (sidebar-rail.tsx) reads the same model.
 */
export function SidebarContent({
  onSearch,
  onCollapse,
}: {
  onSearch: () => void;
  /** Only where it can be folded: the menu on a phone is always whole. */
  onCollapse?: () => void;
}) {
  const { t } = useTranslation();
  const model = useSidebarModel();

  const renderLink = (link: SidebarLink) => (
    <NavItem
      key={link.key}
      to={link.to}
      params={link.params}
      icon={link.icon}
      label={link.label}
    />
  );

  return (
    <>
      <KometioMark />
      <SiteBlock />
      {/* The search, visible: a box that says what it finds and the key
          that opens it, so it is there for people who will never press it. */}
      <SearchTrigger
        onClick={onSearch}
        label={t('shell.search.open')}
        shortcut={formatShortcut(['mod', 'K'])}
        className="w-full"
      />
      <div className="flex flex-1 flex-col gap-4">
        {/* A list of one, so the item is in a list: a list item on its own
            is announced as nothing at all. */}
        <ul className="contents">{model.home.map(renderLink)}</ul>
        <NavGroup title={t('shell.nav.groupContent')}>
          {model.content.map(renderLink)}
        </NavGroup>
        <NavGroup title={t('shell.nav.groupSite')}>
          {model.appearance.map(renderLink)}
        </NavGroup>
        {/* Pushes what follows to the foot, above the account. */}
        <div className="flex-1" />
        {model.settings && (
          <ul className="contents">{renderLink(model.settings)}</ul>
        )}
        {onCollapse && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCollapse}
            className="w-full justify-start gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground"
          >
            <PanelLeftClose className="size-4" />
            {t('shell.sidebar.collapse')}
          </Button>
        )}
      </div>
      <AccountMenu />
    </>
  );
}
