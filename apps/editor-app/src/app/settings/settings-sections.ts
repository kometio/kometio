import {
  Archive,
  Building2,
  Clock,
  Cookie,
  FolderTree,
  Globe,
  Languages,
  Plug,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@kometio/shared-types';
import type { ServerFeature } from '../common/deployment-queries';

export type SettingsGroup = 'site' | 'connections' | 'privacy';

export interface SettingsSectionDefinition {
  id: string;
  to: string;
  icon: LucideIcon;
  group: SettingsGroup;
  /** Who is offered the section — the same permission its route asks for. */
  permission: Permission;
  /** What the server must be able to do for the section to be offered at all (`GET /api/deployment`): most need nothing of it. */
  requires?: ServerFeature;
}

/**
 * Every section of the settings area, in the order the menu shows them.
 *
 * One list, read by the menu beside the sections, by the page an address
 * with no section opens on, and by the search that jumps to them: a section
 * added here is in all three, and cannot be offered in one and missing from
 * another. The words are `settings.nav.items.<id>` and
 * `settings.nav.groups.<group>`.
 *
 * A collection goes live without a publish (docs/roles.md), so it is a
 * publisher's; the rest of the site's own settings are an admin's.
 */
export const SETTINGS_SECTIONS = [
  {
    id: 'general',
    to: '/settings/general',
    icon: Globe,
    group: 'site',
    permission: 'configureSite',
  },
  {
    id: 'languages',
    to: '/settings/languages',
    icon: Languages,
    group: 'site',
    permission: 'configureSite',
  },
  {
    id: 'seo',
    to: '/settings/seo',
    icon: Search,
    group: 'site',
    permission: 'configureSite',
  },
  {
    id: 'business',
    to: '/settings/business',
    icon: Building2,
    group: 'site',
    permission: 'configureSite',
  },
  {
    id: 'collections',
    to: '/settings/collections',
    icon: FolderTree,
    group: 'site',
    permission: 'changeLiveSite',
  },
  {
    id: 'integrations',
    to: '/settings/integrations',
    icon: Plug,
    group: 'connections',
    permission: 'configureSite',
  },
  {
    id: 'ai',
    to: '/settings/ai',
    icon: Sparkles,
    group: 'connections',
    permission: 'configureSite',
  },
  {
    id: 'cookies',
    to: '/settings/cookies',
    icon: Cookie,
    group: 'privacy',
    permission: 'configureSite',
  },
  {
    id: 'retention',
    to: '/settings/retention',
    icon: Clock,
    group: 'privacy',
    permission: 'configureSite',
  },
  {
    id: 'users',
    to: '/settings/users',
    icon: Users,
    group: 'privacy',
    permission: 'configureSite',
  },
  {
    id: 'export',
    to: '/settings/export',
    icon: Archive,
    group: 'privacy',
    permission: 'configureSite',
    requires: 'siteArchive',
  },
] as const satisfies readonly SettingsSectionDefinition[];

/** One entry of the list, with its own literal `id` and `to`: the words and the routes are keyed by them. */
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** Whether the server can do what a section needs of it (`requires`), which is nothing for most. */
export function isOfferedBy(
  section: SettingsSectionDefinition,
  server: Readonly<Record<ServerFeature, boolean>>,
): boolean {
  return section.requires === undefined || server[section.requires];
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  'site',
  'connections',
  'privacy',
];
