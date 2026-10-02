import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@tanstack/react-router';
import { CommandMenu } from '../common/command-menu';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { useInterfaceLanguage } from '../account/use-interface-language';
import { useTheme } from '../style/use-theme';
import {
  globalSearchGroups,
  runGlobalSearchItem,
} from './global-search-commands';
import { useGlobalSearchItems } from './use-global-search-items';

export interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The search of the whole editor, opened from the field in the sidebar, the
 * button on a phone, or Ctrl/⌘+K: a page, a file, a setting, an action, or
 * a preference, found by a word and done with Enter.
 *
 * It is the command menu the canvas has, given the shell's entries. Every
 * one of them is also somewhere on screen; this is the quick way there.
 */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { setTheme } = useTheme();
  const { choose: setLanguage } = useInterfaceLanguage();
  const [query, setQuery] = useState('');
  const { items, loading } = useGlobalSearchItems({ open, query });

  return (
    <CommandMenu
      open={open}
      onOpenChange={onOpenChange}
      title={t('shell.search.title')}
      placeholder={t('shell.search.placeholder')}
      groups={globalSearchGroups({
        go: t('shell.search.groups.go'),
        actions: t('shell.search.groups.actions'),
        preferences: t('shell.search.groups.preferences'),
        pages: t('shell.search.groups.pages'),
        media: t('shell.search.groups.media'),
        forms: t('shell.search.groups.forms'),
      })}
      items={items}
      loading={loading}
      onQueryChange={setQuery}
      onRun={(item) =>
        runGlobalSearchItem(item, {
          // A path with its query, as an address: the router reads it the
          // way it reads one typed by hand.
          goTo: (path) => router.history.push(path),
          openSite: () =>
            window.open(PUBLIC_SITE_URL, '_blank', 'noopener,noreferrer'),
          setTheme,
          setLanguage,
        })
      }
    />
  );
}
