import { createContext, type ReactNode, useContext } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  TriangleAlert,
} from 'lucide-react';
import { BlockIcon } from './block-icons';
import { TreeGuides } from '../common/tree-guides';
import type { Block } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import { IconButton } from '../common/icon-button';
import { ListItemButton } from '../../components/ui/list-item-button';
import {
  ContextMenu,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';

/** One indent step, and the row height the elbow has to meet in the middle of. */
export const INDENT = 14;
/** Measured in a browser: a row is 28px tall (the row button's line plus its padding). Said 22 before, which put every elbow 3px above the row it joined. */
export const ROW_HEIGHT = 28;
/** The collapse toggle's box — WCAG 2.5.8's 24px minimum target. */
const TOGGLE_SIZE = 24;
/** Moves each guide from the middle of its indent to the middle of the toggle above it, which is what the line is joining. */
const GUIDE_OFFSET = TOGGLE_SIZE / 2 - INDENT / 2;

/** What the panel needs to know about a block type: the name it was picked by, and its picture. */
export interface LayerTypeDescription {
  label: string;
  icon?: string;
}

/** What a block's row says: the name it was picked by, translated, or its type for one nobody described. */
export function blockName(
  block: Block,
  describeType: (type: string) => LayerTypeDescription | undefined,
  tLabel: (key: string) => string,
): string {
  const description = describeType(block.type);
  return description ? tLabel(description.label) : block.type;
}

/**
 * What every row of one tree shares: the selection, the hover, what is
 * collapsed, the handlers, and what each block type is called.
 *
 * Handed down as props, these nine went through every level of the tree
 * unchanged, and each new one (the missing icons, the type descriptions)
 * meant another line at both places a row is drawn. A row now takes only
 * what is its own: its block and where it sits.
 */
export interface LayersTree {
  hoveredBlockId: string | null;
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  onSelect: (blockId: string, additive: boolean) => void;
  contextMenu?: ReactNode;
  collapsedIds: ReadonlySet<string>;
  onToggleCollapsed: (blockId: string) => void;
  missingIcons: ReadonlyMap<string, readonly string[]>;
  placeholders: ReadonlyMap<string, readonly string[]>;
  describeType: (type: string) => LayerTypeDescription | undefined;
}

export const LayersTreeContext = createContext<LayersTree | null>(null);

function useLayersTree(): LayersTree {
  const tree = useContext(LayersTreeContext);
  if (!tree) {
    throw new Error('A layer row is drawn only inside LayersPanel.');
  }
  return tree;
}

export interface LayerRowProps {
  block: Block;
  depth: number;
  /** Whether this row is the last of its siblings — the line under it stops at its elbow. */
  isLast?: boolean;
  /**
   * For each level above this row, whether the ancestor at that level was
   * the last of its siblings.
   *
   * A tree guide is not just "a line per level": the line under the LAST
   * child has to stop at its elbow, or the tree draws a branch continuing
   * past the point where it ended. Only the row knows its own position;
   * its ancestors' positions have to be handed down.
   */
  ancestorIsLast?: boolean[];
}

function rowClassName(isSelected: boolean, isHovered: boolean): string {
  // The layout is ListItemButton's; the state is the canvas's, which
  // hovers a row when its block is pointed at in the page, not only here.
  const base = 'cursor-pointer gap-1.5';
  if (isSelected)
    return `${base} rounded-md bg-primary/10 px-2 py-1 text-sm font-medium`;
  if (isHovered) return `${base} rounded-md bg-muted px-2 py-1 text-sm`;
  return `${base} px-2 py-1 text-sm text-muted-foreground`;
}

/** Whether a block anywhere under these is in `found` — what a collapsed row has to say for the rows it hides. */
function hidesAny(
  blocks: readonly Block[],
  found: ReadonlyMap<string, readonly string[]>,
): boolean {
  return blocks.some(
    (block) =>
      Boolean(block.id && found.has(block.id)) ||
      hidesAny(block.children ?? [], found),
  );
}

/**
 * What a row has to warn about from one list of findings (missing icons,
 * placeholders), or `null` for nothing. A row's own findings first; a
 * collapsed row with none of its own still has to say there are some
 * inside it, or the only rows that could tell you are the ones you cannot
 * see.
 */
function findingsOnRow(
  block: Block,
  isCollapsed: boolean,
  found: ReadonlyMap<string, readonly string[]>,
): { names: readonly string[] } | { hidden: true } | null {
  const own = block.id ? found.get(block.id) : undefined;
  if (own) {
    return { names: own };
  }
  if (isCollapsed && hidesAny(block.children ?? [], found)) {
    return { hidden: true };
  }
  return null;
}

export function LayerRow({
  block,
  depth,
  ancestorIsLast = [],
  isLast = true,
}: LayerRowProps) {
  const {
    hoveredBlockId,
    selectedBlockId,
    selectedBlockIds,
    onSelect,
    contextMenu,
    collapsedIds,
    onToggleCollapsed,
    missingIcons,
    placeholders,
    describeType,
  } = useLayersTree();
  // Every selected row looks selected, not only the primary (Fase 7): a
  // multi-selection you cannot see is a multi-selection you will delete by
  // accident.
  const isSelected = Boolean(
    block.id &&
    (block.id === selectedBlockId || selectedBlockIds.includes(block.id)),
  );
  const isHovered = block.id === hoveredBlockId;
  const blockId = block.id;
  const hasChildren = Boolean(block.children && block.children.length > 0);
  const isCollapsed = Boolean(blockId && collapsedIds.has(blockId));
  const { t, tLabel } = useTranslation();

  const description = describeType(block.type);

  const label = blockName(block, describeType, tLabel);
  const missing = findingsOnRow(block, isCollapsed, missingIcons);
  const placeholder = findingsOnRow(block, isCollapsed, placeholders);
  const warning =
    [
      missing === null
        ? null
        : 'names' in missing
          ? t('canvas.layerMissingIcon', { names: missing.names.join(', ') })
          : t('canvas.layerHidesMissingIcon'),
      placeholder === null
        ? null
        : 'names' in placeholder
          ? t('canvas.layerPlaceholder')
          : t('canvas.layerHidesPlaceholder'),
    ]
      .filter(Boolean)
      .join(' ') || null;
  // The list item is what moves, and the pointer picks it up anywhere on
  // the row; the keyboard picks it up from the handle, which carries the
  // button role, the tab stop and the drag instructions. Before, all of
  // that sat on a wrapper around the item: the list held "buttons" instead
  // of items, and those held the row's own buttons inside them. A block
  // with no id has nothing to sort by, so its row stays put.
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: blockId ?? '', disabled: !blockId });

  const rowButton = (
    <ListItemButton
      inset="none"
      data-testid="layer-row"
      data-block-id={blockId}
      data-state={isSelected ? 'selected' : isHovered ? 'hovered' : 'idle'}
      className={rowClassName(isSelected, isHovered)}
      disabled={!blockId}
      onClick={(event) => {
        if (blockId) {
          onSelect(blockId, event.metaKey || event.ctrlKey);
        }
      }}
      onContextMenu={() => {
        // Selected first, and NOT additively: the menu acts on the
        // selection, so right-clicking one row and deleting must not
        // take whatever was selected before it as well.
        if (blockId && contextMenu) onSelect(blockId, false);
      }}
    >
      <BlockIcon
        name={description?.icon}
        size={16}
        className="shrink-0 text-muted-foreground"
      />
      {/* The name a person picked this block by, not its type: the
          tree used to read `FeatureGrid` and `EmbedHtml`, which are
          our words for it. Every block already had a translated
          label — the panel simply was not asking for it. */}
      <span className="truncate">{label}</span>
      {warning && (
        <>
          {/* Seen at a glance, read on hover; the text beside it is
              what a screen reader announces as part of the row. */}
          <span
            aria-hidden="true"
            title={warning}
            className="ml-auto flex shrink-0 text-warning"
          >
            <TriangleAlert size={14} />
          </span>
          <span className="sr-only">{warning}</span>
        </>
      )}
    </ListItemButton>
  );

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
      }}
      className="relative"
      {...(blockId ? listeners : {})}
    >
      {/* One guide per level the row sits under, plus the elbow that joins
          this row to its parent. Indentation alone stopped being readable
          at the third level: `Columns > Column > Code` was three rows at
          three margins, and which Column the Code belonged to was a
          guess. The lines answer that without being read. */}
      <TreeGuides
        depth={depth}
        isLast={isLast}
        ancestorIsLast={ancestorIsLast}
        indent={INDENT}
        rowHeight={ROW_HEIGHT}
        offset={GUIDE_OFFSET}
      />
      {/* The hover group is this row, not the list item: an item holds
          its children, so hovering a nested row hovered every ancestor
          too and lit a handle on each of them. */}
      <div
        className="group/row flex items-center"
        style={{ paddingLeft: depth * INDENT }}
      >
        {hasChildren ? (
          <IconButton
            label={
              isCollapsed
                ? t('canvas.expandChildren')
                : t('canvas.collapseChildren')
            }
            // TOGGLE_SIZE: WCAG 2.5.8's minimum target, with the tree
            // guides offset to its centre (GUIDE_OFFSET).
            size="icon-xs"
            // No `aria-expanded`: the label says which way it goes, and
            // `ghost` would paint every open branch as pressed.
            className="text-muted-foreground"
            onClick={() => blockId && onToggleCollapsed(blockId)}
          >
            {isCollapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </IconButton>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        {/* A row with nothing to act on (no id) opens no menu. */}
        {blockId && contextMenu ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{rowButton}</ContextMenuTrigger>
            {contextMenu}
          </ContextMenu>
        ) : (
          rowButton
        )}
        {blockId && (
          <IconButton
            ref={setActivatorNodeRef}
            {...attributes}
            label={t('canvas.dragLayer', { name: label })}
            size="icon-xs"
            // Out of sight until the row is pointed at or the handle is
            // reached with Tab: a grip on every row of a long tree is
            // noise to anyone using a mouse, who drags the row itself.
            className="cursor-grab text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          >
            <GripVertical className="size-3.5" aria-hidden />
          </IconButton>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <ul>
          {block.children?.map((child, index) =>
            renderRow(
              {
                block: child,
                depth: depth + 1,
                ancestorIsLast: [...ancestorIsLast, isLast],
                isLast: index === (block.children?.length ?? 0) - 1,
              },
              index,
            ),
          )}
        </ul>
      )}
    </li>
  );
}

/**
 * One row, shared by the root level (`LayersPanel`) and every nested level
 * (`LayerRow`'s own call), so every depth of the tree is draggable the same
 * way. `fallbackKey` is the index in the sibling list, the React key only
 * when the block has no id (and so nothing to drag it by).
 */
export function renderRow(
  props: LayerRowProps,
  fallbackKey: number,
): ReactNode {
  return <LayerRow key={props.block.id ?? fallbackKey} {...props} />;
}
