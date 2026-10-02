import { Copy, MoveDown, MoveUp, Trash2 } from 'lucide-react';
import { useTranslation } from '../../lib/use-translation';
import {
  ContextMenuContent,
  ContextMenuItem,
} from '../../components/ui/context-menu';

export interface LayerContextMenuProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * The few things worth doing to a block without leaving the tree, on the
 * block the row was opened on (the row selects it first, see LayersPanel).
 *
 * Four, not everything the toolbar offers: a context menu that lists
 * every action is a second toolbar with worse discoverability. These are
 * the ones that are about a block's place in the tree, which is what the
 * tree is for — styling and content stay where they already are.
 *
 * It is not a replacement for the canvas toolbar. It is the way to reach
 * a block the canvas cannot give you: one that renders to nothing gets a
 * placeholder now, but one scrolled far out of view, or buried three
 * containers deep, is still easier to reach here.
 */
export function LayerContextMenu({
  canMoveUp,
  canMoveDown,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: LayerContextMenuProps) {
  const { t } = useTranslation();
  return (
    <ContextMenuContent aria-label={t('canvas.layersTitle')}>
      <ContextMenuItem onSelect={onDuplicate}>
        <Copy aria-hidden />
        {t('canvas.duplicateBlock')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
        <MoveUp aria-hidden />
        {t('canvas.moveUp')}
      </ContextMenuItem>
      <ContextMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
        <MoveDown aria-hidden />
        {t('canvas.moveDown')}
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={onDelete}>
        <Trash2 aria-hidden />
        {t('canvas.removeBlock')}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
