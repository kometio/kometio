import type {
  Active,
  Announcements,
  Over,
  ScreenReaderInstructions,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { useTranslation } from '../../lib/use-translation';

/** Where a sortable item sits, 1-based, as a person counts it. */
interface ListPosition {
  position: number;
  total: number;
}

/**
 * The place `@dnd-kit/sortable` records on every item it manages
 * (`data.current.sortable`). dnd-kit types the data bag as anything, so
 * it is checked rather than assumed.
 */
function isSortableData(
  value: unknown,
): value is { index: number; items: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'index' in value &&
    typeof value.index === 'number' &&
    'items' in value &&
    Array.isArray(value.items)
  );
}

function positionOf(item: Active | Over): ListPosition | null {
  const sortable = item.data.current?.sortable;
  return isSortableData(sortable)
    ? { position: sortable.index + 1, total: sortable.items.length }
    : null;
}

/**
 * What a screen reader hears during a keyboard drag, in the editor's
 * language and in the words on screen: the item's own name and where it
 * now sits in the list ("position 2 of 3"). dnd-kit's defaults are
 * English whatever the editor speaks, and name items by their internal
 * id — and "over Heading" says little in a list of three Headings.
 *
 * `nameOf` turns an item's id into what its row shows.
 */
export function useDragAnnouncements(
  nameOf: (id: UniqueIdentifier) => string,
): {
  announcements: Announcements;
  screenReaderInstructions: ScreenReaderInstructions;
} {
  const { t } = useTranslation();

  return {
    announcements: {
      onDragStart: ({ active }) => {
        const name = nameOf(active.id);
        const where = positionOf(active);
        return where
          ? t('dragAnnouncements.pickedUp', { name, ...where })
          : t('dragAnnouncements.pickedUpPlain', { name });
      },
      onDragOver: ({ active, over }) => {
        const name = nameOf(active.id);
        if (!over) return t('dragAnnouncements.outside', { name });
        const where = positionOf(over);
        return where
          ? t('dragAnnouncements.moved', { name, ...where })
          : t('dragAnnouncements.movedPlain', { name });
      },
      onDragEnd: ({ active, over }) => {
        const name = nameOf(active.id);
        if (!over) return t('dragAnnouncements.droppedOutside', { name });
        const where = positionOf(over);
        return where
          ? t('dragAnnouncements.dropped', { name, ...where })
          : t('dragAnnouncements.droppedPlain', { name });
      },
      onDragCancel: ({ active }) =>
        t('dragAnnouncements.cancelled', { name: nameOf(active.id) }),
    },
    screenReaderInstructions: {
      draggable: t('dragAnnouncements.instructions'),
    },
  };
}
