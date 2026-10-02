import { createElement } from 'react';
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  Camera,
  GraduationCap,
  Heart,
  Megaphone,
  Newspaper,
  Package,
  Star,
  type LucideIcon,
} from 'lucide-react';

/**
 * The icons a collection can wear in the sidebar.
 *
 * A short curated list, not the whole lucide set: the choice is made
 * once when somebody names a collection, and a thousand-icon picker turns a
 * two-second decision into a browsing session. Everything unknown falls
 * back rather than rendering a hole in a list of eleven entries.
 */
export const COLLECTION_ICONS = {
  newspaper: Newspaper,
  'calendar-days': CalendarDays,
  briefcase: Briefcase,
  'book-open': BookOpen,
  star: Star,
  megaphone: Megaphone,
  camera: Camera,
  package: Package,
  'graduation-cap': GraduationCap,
  heart: Heart,
} satisfies Record<string, LucideIcon>;

export type CollectionIconName = keyof typeof COLLECTION_ICONS;

/** What a new collection starts with, and what an icon name nobody knows falls back to. */
export const DEFAULT_COLLECTION_ICON: CollectionIconName = 'newspaper';

/** A stored icon name this editor still knows — collections keep theirs as a plain string. */
export function isCollectionIconName(name: string): name is CollectionIconName {
  return Object.prototype.hasOwnProperty.call(COLLECTION_ICONS, name);
}

export const COLLECTION_ICON_NAMES: CollectionIconName[] =
  Object.keys(COLLECTION_ICONS).filter(isCollectionIconName);

export function collectionIcon(name: string): LucideIcon {
  return COLLECTION_ICONS[
    isCollectionIconName(name) ? name : DEFAULT_COLLECTION_ICON
  ];
}

/** Rendered with createElement, never `<Icon />` — see block-icons.tsx: a component built during render trips React. */
export function CollectionIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return createElement(collectionIcon(name), { className });
}
