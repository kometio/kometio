import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  ExternalLink,
  Languages,
  MailPlus,
  Monitor,
  Moon,
  Plus,
  Sun,
  Upload,
  UserRound,
} from 'lucide-react';
import type { CommandItem } from '../common/command-menu';
import { useCurrentSession } from '../auth/use-current-session';
import { UI_LANGUAGES } from '../account/interface-languages';
import { CollectionIcon } from '../collections/collection-icons';
import { SETTINGS_SECTIONS } from '../settings/settings-sections';
import { NAV_ENTRIES } from './nav-entries';

/*
 * The entries of the shell's search that need nothing from the server:
 * where to go, what to do, and what to change about the editor. Each is its
 * own hook because each is its own question — and because the words are
 * typed against the translations, which only holds where `t` comes straight
 * from the hook that uses it.
 */

/** Where to go: every screen the sidebar has, and every section of the settings, that this role is offered. */
export function useGoEntries(
  collections: { id: string; name: string; icon: string }[],
): CommandItem[] {
  const { t } = useTranslation();
  const { can } = useCurrentSession();
  const items: CommandItem[] = [];

  for (const entry of NAV_ENTRIES) {
    if (entry.permission && !can(entry.permission)) continue;
    const Icon = entry.icon;
    items.push({
      id: `go:${entry.to}`,
      group: 'go',
      label: t(entry.labelKey),
      icon: <Icon />,
    });
    // They sit under Pages in the sidebar, and here.
    if (entry.id !== 'pages') continue;
    for (const collection of collections) {
      items.push({
        id: `go:/collections/${collection.id}`,
        group: 'go',
        label: collection.name,
        detail: t('shell.nav.pages'),
        icon: <CollectionIcon name={collection.icon} />,
      });
    }
  }
  for (const section of SETTINGS_SECTIONS) {
    if (!can(section.permission)) continue;
    const Icon = section.icon;
    items.push({
      id: `go:${section.to}`,
      group: 'go',
      label: t(`settings.nav.items.${section.id}`),
      // Found under the area's name too: "settings seo" finds SEO.
      detail: t('shell.nav.settings'),
      keywords: t('shell.nav.settings'),
      icon: <Icon />,
    });
  }
  items.push({
    id: 'go:/account',
    group: 'go',
    label: t('shell.account.profile'),
    icon: <UserRound />,
  });
  return items;
}

/** What to do: the things a button somewhere else already does, one keystroke nearer. */
export function useActionEntries(): CommandItem[] {
  const { t } = useTranslation();
  const { can } = useCurrentSession();
  const items: CommandItem[] = [
    {
      id: 'action:new-page',
      group: 'actions',
      label: t('dashboard.actions.newPage'),
      icon: <Plus />,
    },
    {
      id: 'action:upload',
      group: 'actions',
      label: t('shell.search.actions.upload'),
      icon: <Upload />,
    },
  ];
  // A form is live once created (docs/roles.md): a publisher's.
  if (can('changeLiveSite')) {
    items.push({
      id: 'action:new-form',
      group: 'actions',
      label: t('forms.list.newForm'),
      icon: <ClipboardList />,
    });
  }
  if (can('configureSite')) {
    items.push({
      id: 'action:invite-user',
      group: 'actions',
      label: t('users.list.invite'),
      icon: <MailPlus />,
    });
  }
  items.push({
    id: 'action:open-site',
    group: 'actions',
    label: t('dashboard.actions.openSite'),
    icon: <ExternalLink />,
  });
  return items;
}

/** What to change about the editor itself: the person's language and theme, which live in the account menu. */
export function usePreferenceEntries(): CommandItem[] {
  const { t, i18n } = useTranslation();
  const themes = [
    {
      value: 'light',
      label: t('shell.search.preferences.themeLight'),
      icon: <Sun />,
    },
    {
      value: 'dark',
      label: t('shell.search.preferences.themeDark'),
      icon: <Moon />,
    },
    {
      value: 'system',
      label: t('shell.search.preferences.themeSystem'),
      icon: <Monitor />,
    },
  ];
  return [
    ...themes.map(({ value, label, icon }): CommandItem => ({
      id: `pref:theme:${value}`,
      group: 'preferences',
      label,
      keywords: t('shell.account.theme'),
      icon,
    })),
    // The languages it is not already in: choosing the current one would
    // do nothing, and would still sit in the list.
    ...UI_LANGUAGES.filter((option) => option.value !== i18n.language).map(
      (option): CommandItem => ({
        id: `pref:language:${option.value}`,
        group: 'preferences',
        label: t('shell.search.preferences.language', { name: option.label }),
        keywords: t('shell.account.language'),
        icon: <Languages />,
      }),
    ),
  ];
}
