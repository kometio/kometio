import type { CommandGroup, CommandItem } from '../common/command-menu';

/**
 * The groups of the shell's search, in the order they are listed: where to
 * go and what to do come first, because they are what people type a word
 * for, and the results that come from the server follow.
 */
export const GLOBAL_SEARCH_GROUP_IDS = [
  'go',
  'actions',
  'preferences',
  'pages',
  'media',
  'forms',
] as const;

export type GlobalSearchGroupId = (typeof GLOBAL_SEARCH_GROUP_IDS)[number];

export function globalSearchGroups(
  labels: Record<GlobalSearchGroupId, string>,
): CommandGroup[] {
  return GLOBAL_SEARCH_GROUP_IDS.map((id) => ({ id, label: labels[id] }));
}

/**
 * What choosing an entry does. Every entry says so in its id — `go:` a
 * path, `action:` a name, `pref:` a preference and its value, `page:`,
 * `media:` and `form:` a thing found — so one function answers for all of
 * them, and the list is plain data that can be built during render.
 */
export interface GlobalSearchActions {
  /** Opens an address of the editor, query string included. */
  goTo: (path: string) => void;
  openSite: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (language: string) => void;
}

/** The screens the "new" actions land on, and the parameter each reads once to open its dialog. */
const ACTION_PATHS: Record<string, string> = {
  'new-page': '/pages?page=1&new=true',
  upload: '/media',
  'new-form': '/forms?page=1&new=true',
  'invite-user': '/settings/users?page=1&invite=true',
};

function isTheme(value: string): value is 'light' | 'dark' | 'system' {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function runGlobalSearchItem(
  item: Pick<CommandItem, 'id' | 'label'>,
  actions: GlobalSearchActions,
): void {
  const { id } = item;
  const separator = id.indexOf(':');
  const kind = id.slice(0, separator);
  const key = id.slice(separator + 1);

  if (kind === 'go') {
    actions.goTo(key);
  } else if (kind === 'action') {
    if (key === 'open-site') {
      actions.openSite();
      return;
    }
    const path = ACTION_PATHS[key];
    if (path) actions.goTo(path);
  } else if (kind === 'pref') {
    const [preference, value = ''] = key.split(':');
    if (preference === 'theme' && isTheme(value)) actions.setTheme(value);
    else if (preference === 'language') actions.setLanguage(value);
  } else if (kind === 'page') {
    // The page itself, in the canvas.
    actions.goTo(`/page-groups/${key}`);
  } else if (kind === 'media') {
    // The library, narrowed to that name: a file has no page of its own.
    const name = new URLSearchParams({ page: '1', search: item.label });
    actions.goTo(`/media?${name.toString()}`);
  } else if (kind === 'form') {
    actions.goTo(`/forms/${key}`);
  }
}
