import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { PageGroupListItemRecord } from '@kometio/api-contracts';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { IconButton } from '../common/icon-button';
import { TranslationAvailabilityBadges } from './translation-availability-badges';
import { TreeGuides } from '../common/tree-guides';
import { useFormatDate } from '../../lib/use-format-date';
import {
  groupDisplayTitle,
  groupStatusBadge,
  preferredTranslation,
} from './page-group-display';
import {
  AUTHOR_COLUMN,
  EDITOR_COLUMN,
  EMPTY_CELL,
  LOCALES_COLUMN,
  PAGE_INDENT,
  PAGE_ROW_HEIGHT,
  PAGE_ROW_INSET,
  SELECT_COLUMN,
  STATUS_COLUMN,
  UPDATED_COLUMN,
} from './page-groups-list-columns';

export interface PageGroupRowProps {
  group: PageGroupListItemRecord;
  depth: number;
  isLast: boolean;
  ancestorIsLast: readonly boolean[];
  isSelected: boolean;
  defaultLocale: string;
  enabledLocales: string[];
  draggable: boolean;
  /**
   * Whether either author column is being drawn at all. "Created by" and
   * "Last edited by" are "—" on fifteen rows out of sixteen, and between
   * them they took a third of the table to say nothing — so a page of
   * results where nobody is named does not draw them.
   */
  showCreatedBy: boolean;
  showLastEditedBy: boolean;
  onToggleSelected: () => void;
}

/**
 * One page in the list.
 *
 * Its title is a link that opens it, like a title anywhere else: the row
 * used to be a button that selected it, with the way in one of five icons
 * that appeared only once it was selected. Choosing pages to act on is the
 * box at the start of the row; what the actions are is said once, in the
 * bar over the list, and not once per row.
 *
 * The drag handle only renders (and only participates in `useSortable`)
 * when `draggable` — reordering needs the FULL real sibling group
 * server-side (see reorderSiblingPageGroups), so it's disabled whenever
 * the visible `groups` array is a strict subset of that (an active
 * filter, or more than one page of results): a drag under either
 * condition would predictably fail with a permutation-mismatch error.
 */
export function PageGroupRow({
  group,
  depth,
  isLast,
  ancestorIsLast,
  isSelected,
  defaultLocale,
  enabledLocales,
  draggable,
  showCreatedBy,
  showLastEditedBy,
  onToggleSelected,
}: PageGroupRowProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const translation = preferredTranslation(group, defaultLocale);
  const statusBadge = groupStatusBadge(group, defaultLocale);
  const title = groupDisplayTitle(group, defaultLocale);
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: group.id, disabled: !draggable });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        paddingLeft: PAGE_ROW_INSET + depth * PAGE_INDENT,
      }}
      className={cn(
        'relative flex items-center gap-2 pr-3',
        // A left rule marks a selected row. The tint alone was doing the
        // whole job, and on a dark list a tint is something you have to
        // look for; the rule is visible without looking.
        'before:absolute before:inset-y-0 before:left-0 before:w-0.75',
        // The row itself carries the state, not the box inside it.
        isSelected
          ? 'bg-muted before:bg-primary'
          : 'hover:bg-muted/50 before:bg-transparent',
      )}
    >
      {/* The same guides the canvas Layers panel draws. This list was a
          tree only in the sense that children were indented: at the third
          level, which parent a page belonged to was a guess. */}
      <TreeGuides
        depth={depth}
        isLast={isLast}
        ancestorIsLast={ancestorIsLast}
        indent={PAGE_INDENT}
        rowHeight={PAGE_ROW_HEIGHT}
        offset={PAGE_ROW_INSET}
      />
      <span className={cn('flex shrink-0 justify-center', SELECT_COLUMN)}>
        <Checkbox
          aria-label={t('pages.list.selectRow', { title })}
          checked={isSelected}
          onCheckedChange={onToggleSelected}
        />
      </span>
      {draggable && (
        <IconButton
          label={t('pages.list.dragHandle')}
          size="icon-xs"
          // 16px, as the tree's guides are drawn for. WCAG 2.5.8's spacing
          // exception covers it: the title link is 8px away.
          className="size-4 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </IconButton>
      )}
      <span className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2">
        <span className="flex min-w-0 flex-1 flex-col">
          {/* `min-w-0` all the way down: a flex item cannot shrink below
              its content unless told it may, so a long title pushed the
              language badges past the edge of a narrow screen instead of
              truncating. */}
          <Link
            to="/page-groups/$groupId"
            params={{ groupId: group.id }}
            className={cn(
              'truncate text-sm hover:underline focus-visible:underline focus-visible:outline-none',
              isSelected ? 'font-semibold' : 'font-medium',
            )}
          >
            {title}
          </Link>
          {/* The address, under the name it answers to. A page is a title
              AND a URL, and the URL was the half you had to open the page
              to see. */}
          {translation && (
            <span className="truncate font-mono text-xs text-muted-foreground">
              /{translation.slug}
            </span>
          )}
          {/* Under the address on a phone, where the column that holds it
              is not drawn: the state used to vanish with it. */}
          <span className="mt-1 md:hidden">
            <Badge variant={statusBadge.variant}>{t(statusBadge.key)}</Badge>
          </span>
        </span>
        {/* Each in a column of its own, under the header that names it:
            run together after the title, they read as part of it. */}
        <span className={cn('flex shrink-0 justify-start', LOCALES_COLUMN)}>
          <TranslationAvailabilityBadges
            translations={group.translations}
            enabledLocales={enabledLocales}
          />
        </span>
        <span className={STATUS_COLUMN}>
          {/* A state, so a state colour and its word: the column said it
              in plain text, and the one state that costs somebody
              something — what is online is not what they last wrote —
              looked like the rest. */}
          <Badge variant={statusBadge.variant}>{t(statusBadge.key)}</Badge>
        </span>
        {showCreatedBy && (
          <span
            className={cn(
              'truncate text-xs text-muted-foreground',
              AUTHOR_COLUMN,
            )}
          >
            {group.createdByName ?? EMPTY_CELL}
          </span>
        )}
        {showLastEditedBy && (
          <span
            className={cn(
              'truncate text-xs text-muted-foreground',
              EDITOR_COLUMN,
            )}
          >
            {group.lastEditedByName ?? EMPTY_CELL}
          </span>
        )}
        <time
          dateTime={group.lastEditedAt}
          className={cn(
            'text-xs tabular-nums text-muted-foreground',
            UPDATED_COLUMN,
          )}
        >
          {/* A row is not the place to print "Invalid Date" at a person:
              a date we cannot read gets the same dash an absent creator
              gets. */}
          {formatDate(group.lastEditedAt) ?? EMPTY_CELL}
        </time>
      </span>
    </li>
  );
}
