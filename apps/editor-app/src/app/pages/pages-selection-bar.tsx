import { useTranslation } from 'react-i18next';
import {
  Copy,
  FolderInput,
  IndentIncrease,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { SelectionBar } from '../common/selection-bar';

export interface PagesSelectionBarProps {
  /** How many pages are ticked (at least one: the bar is not drawn otherwise). */
  count: number;
  /** Duplicating waits for the pages before it. */
  isBusy: boolean;
  onClear: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  /** Each absent when this person's role may not do it (docs/roles.md). */
  onMoveToCollection?: () => void;
  onMoveUnder?: () => void;
  onDelete?: () => void;
}

/**
 * What can be done to the pages that are ticked (the frame is SelectionBar's).
 *
 * Opening and filing a page under another one work on a single page: opening
 * two at once has no meaning, and each page has its own parent.
 */
export function PagesSelectionBar({
  count,
  isBusy,
  onClear,
  onOpen,
  onDuplicate,
  onMoveToCollection,
  onMoveUnder,
  onDelete,
}: PagesSelectionBarProps) {
  const { t } = useTranslation();
  const isOne = count === 1;

  return (
    <SelectionBar
      label={t('pages.list.selection.label')}
      countText={t('pages.list.selection.count', { count })}
      onClear={onClear}
    >
      {isOne && (
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          <Pencil />
          {t('pages.list.selection.open')}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isBusy}
        onClick={onDuplicate}
      >
        <Copy />
        {t('pages.list.selection.duplicate')}
      </Button>
      {onMoveToCollection && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onMoveToCollection}
        >
          <FolderInput />
          {t('pages.list.selection.moveToCollection')}
        </Button>
      )}
      {isOne && onMoveUnder && (
        <Button type="button" variant="outline" size="sm" onClick={onMoveUnder}>
          <IndentIncrease />
          {t('pages.list.selection.moveUnder')}
        </Button>
      )}
      {onDelete && (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
        >
          <Trash2 />
          {t('pages.list.selection.delete')}
        </Button>
      )}
    </SelectionBar>
  );
}
