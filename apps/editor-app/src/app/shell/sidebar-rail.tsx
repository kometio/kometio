import { useTranslation } from 'react-i18next';
import { ExternalLink, FolderTree, PanelLeftOpen, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AccountMenu } from '../account/account-menu';
import { Button } from '../../components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { Link } from '@tanstack/react-router';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { RailAnchor, RailButton, RailLink } from '../common/rail-item';
import { siteQueryOptions } from '../settings/site-queries';
import { KometioMark } from './kometio-mark';
import { useSidebarModel, type SidebarLink } from './use-sidebar-model';

/** More collections than this and a strip of 72px has no room for them one by one. */
const MAX_COLLECTIONS_IN_STRIP = 3;

/**
 * The collections of the site as one item of the strip, opening a list with
 * their names written: four "News", "Events", "Cases", "Docs" under one
 * another at 12px in 68px are four ellipses.
 */
function CollectionsItem({ collections }: { collections: SidebarLink[] }) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <RailButton
          icon={<FolderTree />}
          label={t('shell.nav.collections')}
          aria-haspopup="dialog"
        />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-56 p-1"
        aria-label={t('shell.nav.collections')}
      >
        {collections.map((collection) => {
          const Icon = collection.icon;
          return (
            <Button
              key={collection.key}
              asChild
              variant="ghost"
              className="w-full justify-start gap-2 px-2"
            >
              <Link to={collection.to} params={collection.params}>
                <Icon className="size-4" />
                <span className="truncate">{collection.label}</span>
              </Link>
            </Button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/** Which of the strip's items a link is: one of its own, or (with many collections) a share of the one that gathers them. */
function StripLinks({ links }: { links: SidebarLink[] }) {
  const collections = links.filter((link) => link.isCollection);
  const gathered = collections.length > MAX_COLLECTIONS_IN_STRIP;
  const firstCollection = collections[0];
  return (
    <>
      {links.map((link) => {
        if (gathered && link.isCollection) {
          // One item for all of them, where the first one would have been.
          return link === firstCollection ? (
            <li key="collections" className="contents">
              <CollectionsItem collections={collections} />
            </li>
          ) : null;
        }
        const Icon = link.icon;
        return (
          <li key={link.key} className="contents">
            <RailLink
              to={link.to}
              params={link.params}
              icon={<Icon />}
              label={link.shortLabel}
              fullName={link.label}
            />
          </li>
        );
      })}
    </>
  );
}

/**
 * The sidebar folded to a 72px strip: the same screens, in the same order,
 * the same look as the strip down the canvas's left edge — a picture with
 * its word under it, and never a picture alone.
 *
 * It reads the model the full sidebar reads, so the two cannot disagree
 * about what exists or who is offered it. What does not fit is shortened
 * (a short word where the name is longer than 68px) or gathered (the
 * collections, when there are more than three), and never dropped.
 */
export function SidebarRail({
  onSearch,
  onExpand,
}: {
  onSearch: () => void;
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const model = useSidebarModel();
  const { data: site } = useQuery(siteQueryOptions());

  return (
    <>
      <KometioMark compact />
      {site && (
        // A link to the site, named for the site it goes to.
        <RailAnchor
          href={PUBLIC_SITE_URL}
          icon={<ExternalLink />}
          label={t('shell.site.short')}
          fullName={t('shell.site.open', { name: site.name })}
        />
      )}
      <RailButton
        icon={<Search />}
        label={t('shell.search.short')}
        aria-haspopup="dialog"
        onClick={onSearch}
      />
      <ul className="flex w-full flex-col gap-1">
        <StripLinks links={model.home} />
      </ul>
      <ul className="flex w-full flex-col gap-1 border-t pt-2">
        <StripLinks links={model.content} />
      </ul>
      <ul className="flex w-full flex-col gap-1 border-t pt-2">
        <StripLinks links={model.appearance} />
      </ul>
      <div className="flex-1" />
      {model.settings && (
        <ul className="flex w-full flex-col gap-1">
          <StripLinks links={[model.settings]} />
        </ul>
      )}
      <RailButton
        icon={<PanelLeftOpen />}
        label={t('shell.sidebar.expand')}
        onClick={onExpand}
      />
      <AccountMenu compact />
    </>
  );
}
