import {
  ClipboardList,
  FileText,
  Image,
  LayoutDashboard,
  LayoutList,
  PanelsTopLeft,
  Palette,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@kometio/shared-types';

export type NavGroupId = 'content' | 'appearance';

export interface NavEntry {
  id: string;
  to:
    | '/'
    | '/pages'
    | '/media'
    | '/forms'
    | '/taxonomies'
    | '/layout'
    | '/sections'
    | '/style';
  icon: LucideIcon;
  /** The words, in `shell.nav`. */
  labelKey:
    | 'shell.nav.dashboard'
    | 'shell.nav.pages'
    | 'shell.nav.media'
    | 'shell.nav.forms'
    | 'shell.nav.taxonomies'
    | 'shell.nav.layout'
    | 'shell.nav.sections'
    | 'shell.nav.style';
  /**
   * The word under the picture in the folded sidebar, when the whole name
   * does not fit 68px at 12px ("Header & footer" is 90). Left out when it
   * does: a shorter word is a second name for the same thing, and only
   * worth it where the room forces it.
   */
  shortLabelKey?: 'shell.nav.short.layout';
  /** Which heading of the sidebar it sits under; the dashboard, on top, has none. */
  group: NavGroupId | null;
  /** Who is offered it (docs/roles.md): an entry the API would refuse is not drawn, nor found by search. */
  permission?: Permission;
}

/**
 * The screens the sidebar links to, in its order.
 *
 * One list, read by the sidebar and by the search that jumps to them: a
 * screen added here is in both, and cannot be offered in one and missing
 * from the other. The collections a site defines, which sit under Pages,
 * and the settings entry at the foot are not here: they are not fixed
 * screens, and each has its own place.
 */
export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    id: 'dashboard',
    to: '/',
    icon: LayoutDashboard,
    labelKey: 'shell.nav.dashboard',
    group: null,
  },
  {
    id: 'pages',
    to: '/pages',
    icon: FileText,
    labelKey: 'shell.nav.pages',
    group: 'content',
  },
  {
    id: 'media',
    to: '/media',
    icon: Image,
    labelKey: 'shell.nav.media',
    group: 'content',
  },
  {
    id: 'forms',
    to: '/forms',
    icon: ClipboardList,
    labelKey: 'shell.nav.forms',
    group: 'content',
  },
  {
    // Every change there shows online at once: a publisher's.
    id: 'taxonomies',
    to: '/taxonomies',
    icon: Tags,
    labelKey: 'shell.nav.taxonomies',
    group: 'content',
    permission: 'changeLiveSite',
  },
  {
    id: 'layout',
    to: '/layout',
    icon: PanelsTopLeft,
    labelKey: 'shell.nav.layout',
    shortLabelKey: 'shell.nav.short.layout',
    group: 'appearance',
  },
  {
    id: 'sections',
    to: '/sections',
    icon: LayoutList,
    labelKey: 'shell.nav.sections',
    group: 'appearance',
  },
  {
    id: 'style',
    to: '/style',
    icon: Palette,
    labelKey: 'shell.nav.style',
    group: 'appearance',
    permission: 'configureSite',
  },
];
