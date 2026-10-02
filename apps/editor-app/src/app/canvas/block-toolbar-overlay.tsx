import { useState, type RefObject } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Rows3,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { BlockRect } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { Button } from '../../components/ui/button';
import { ListItemButton } from '../../components/ui/list-item-button';
import { useTranslation } from '../../lib/use-translation';
import { BlockPicker, type BlockPickerCategory } from './block-picker';
import {
  toAddChildStyle,
  toInsertPointStyle,
  toToolbarStyle,
  useIframeGeometry,
} from './overlay-layer';
import { IconButton } from '../common/icon-button';

export interface BlockToolbarOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  descriptor: BlockDescriptor;
  rect: BlockRect;
  /** True only for a top-level block — it governs insert-sibling (scoped to that level, like drag reordering, see compute-drop-target.ts). NOT move up/down: that works at any depth, see canMoveUp/canMoveDown. */
  isRootLevel: boolean;
  /** True at ANY depth — computed from the block's real position among its siblings (root or nested), not from the root level alone. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  registry: BlockDescriptor[];
  categories: BlockPickerCategory[];
  /**
   * Puts the keyboard in the Properties panel, which has the right side to
   * itself since the popover was retired. The button used to OPEN the panel
   * over the canvas; now the panel is always there and this is how you
   * reach it without the mouse.
   */
  onFocusProperties?: () => void;
  /**
   * Turns this block into a reusable section and replaces it with an
   * instance (docs/adr/0059). Absent where that has no meaning: inside the
   * section editor, and in the header/footer.
   */
  onMakeReusable?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertBefore: (descriptor: BlockDescriptor) => void;
  onInsertAfter: (descriptor: BlockDescriptor) => void;
  /** Present only for a "collection" container (a single type in `allowedChildTypes`, e.g. Testimonials→Testimonial) — it adds another child of that type directly, with no picker: the only sensible type is already known. */
  onAddChild?: () => void;
}

/** The pills that add a block: words on them, so "+" is never a guess. Layout only; the look is the default Button's. */
const pillClassName =
  'pointer-events-auto rounded-full whitespace-nowrap shadow-sm';

/** Separates the groups — move, edit, duplicate/delete. */
function ToolbarSeparator() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />;
}

/**
 * The contextual toolbar anchored to the selected block, and the points
 * where a new block goes above and below it.
 *
 * It shows when a block is SELECTED, never on hover, so it is there for a
 * keyboard as much as for a mouse, and it writes its actions: Properties,
 * Duplicate, Delete, and More for what is used rarely. The arrows are the
 * one pair left as icons, and they carry their names as tooltips and for a
 * screen reader.
 *
 * What it no longer carries is the properties themselves: they have the
 * right panel to themselves (see properties-panel.tsx).
 */
export function BlockToolbarOverlay({
  iframeRef,
  descriptor,
  rect,
  isRootLevel,
  canMoveUp,
  canMoveDown,
  registry,
  categories,
  onFocusProperties,
  onMakeReusable,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onInsertBefore,
  onInsertAfter,
  onAddChild,
}: BlockToolbarOverlayProps) {
  const { t } = useTranslation();
  const geometry = useIframeGeometry(iframeRef);
  const [insertOpen, setInsertOpen] = useState<'before' | 'after' | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const canAddChild =
    descriptor.isContainer && descriptor.allowedChildTypes?.length === 1;

  function insertPoint(edge: 'before' | 'after') {
    const onPick = edge === 'before' ? onInsertBefore : onInsertAfter;
    return (
      <Popover
        open={insertOpen === edge}
        onOpenChange={(open) => setInsertOpen(open ? edge : null)}
      >
        <PopoverTrigger asChild>
          <Button
            size="xs"
            className={pillClassName}
            style={toInsertPointStyle(
              geometry,
              rect,
              edge === 'before' ? 'top' : 'bottom',
            )}
          >
            <Plus />
            {edge === 'before'
              ? t('canvas.toolbar.insertAbove')
              : t('canvas.toolbar.insertBelow')}
          </Button>
        </PopoverTrigger>
        <PopoverContent aria-label={t('canvas.insertBlock')}>
          <BlockPicker
            categories={categories}
            registry={registry}
            onInsert={(picked) => {
              onPick(picked);
              setInsertOpen(null);
            }}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {isRootLevel && insertPoint('before')}

      <div
        role="toolbar"
        aria-label={t('canvas.toolbar.label')}
        className="pointer-events-auto flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        style={toToolbarStyle(geometry, rect)}
      >
        <IconButton
          label={t('canvas.moveUp')}
          size="icon-sm"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <ChevronUp size={16} />
        </IconButton>
        <IconButton
          label={t('canvas.moveDown')}
          size="icon-sm"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <ChevronDown size={16} />
        </IconButton>
        {/* Always offered: the Properties panel exists whatever is
            selected, so there is always somewhere for this to take you. */}
        {onFocusProperties && (
          <>
            <ToolbarSeparator />
            <Button variant="ghost" size="sm" onClick={onFocusProperties}>
              <Pencil />
              {t('canvas.toolbar.properties')}
            </Button>
          </>
        )}
        <ToolbarSeparator />
        <Button variant="ghost" size="sm" onClick={onDuplicate}>
          <Copy />
          {t('canvas.toolbar.duplicate')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 />
          {t('canvas.toolbar.delete')}
        </Button>
        {/* Only where it can actually be honoured: a section is placed on
            a page, so turning a block into one has no meaning inside the
            section editor itself, nor in the header/footer (docs/adr/0059).
            A menu, not a sixth button: it is rare, and it has a long name. */}
        {onMakeReusable && (
          <>
            <ToolbarSeparator />
            <Popover open={isMoreOpen} onOpenChange={setIsMoreOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm">
                  {t('canvas.toolbar.more')}
                  <ChevronDown />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-auto p-1"
                aria-label={t('canvas.toolbar.more')}
              >
                <ListItemButton
                  onClick={() => {
                    setIsMoreOpen(false);
                    onMakeReusable();
                  }}
                >
                  <Rows3 size={16} />
                  {t('sections.makeReusable')}
                </ListItemButton>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {isRootLevel && insertPoint('after')}

      {canAddChild && onAddChild && (
        <Button
          size="xs"
          className={pillClassName}
          style={toAddChildStyle(geometry, rect)}
          onClick={onAddChild}
        >
          <Plus />
          {t('canvas.addChild')}
        </Button>
      )}
    </div>
  );
}
