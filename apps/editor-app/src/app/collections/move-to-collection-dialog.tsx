import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Files } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { actionErrorMessage } from '../../lib/http-client';
import { cn } from '../../lib/utils';
import { CollectionIcon } from './collection-icons';
import { collectionsQueryOptions } from './collections-queries';
import { InlineError } from '../../components/ui/inline-error';

export interface MoveToCollectionDialogProps {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in the question, so it is clear which page is about to move. */
  pageTitle: string;
  /** Where the page is filed today — `null` for the page tree itself. */
  currentCollectionId: string | null;
  onMove: (collectionId: string | null) => Promise<unknown>;
  /** The move is in flight — owned by the caller, which owns the mutation, exactly as the list's other actions are. */
  isMoving: boolean;
}

/**
 * Which collection of the editor lists a page that already exists.
 *
 * Until now the only way into a collection was to create the page from
 * inside it: a page written before its collection existed had to be written
 * again to get in. The endpoint has been there since collections arrived —
 * this is the door to it.
 *
 * A radio list rather than a dropdown: a site has a handful of collections,
 * and seeing them all at once, with the one the page is in already
 * marked, answers "where is this filed" as much as it changes it. "Pages"
 * is one of the options rather than a separate "remove from collection"
 * button — to the person deciding, they are one question, and the page
 * tree is one of the places a page can be listed.
 */
export function MoveToCollectionDialog({
  siteId,
  open,
  onOpenChange,
  pageTitle,
  currentCollectionId,
  onMove,
  isMoving,
}: MoveToCollectionDialogProps) {
  const { t } = useTranslation();
  // Only while it is open: the collections are read on every screen already,
  // and a closed dialog has no question to answer.
  const { data: collections } = useQuery({
    ...collectionsQueryOptions(siteId),
    enabled: open,
  });
  const [target, setTarget] = useState<string | null>(currentCollectionId);
  const [error, setError] = useState('');

  // Opened again on a different page, it must not still offer the answer
  // given for the previous one. Adjusted during render rather than in an
  // effect (react-hooks/set-state-in-effect): the value is derived from a
  // prop, and an effect would render the stale answer once first.
  const [openedFor, setOpenedFor] = useState<string | null>(
    open ? currentCollectionId : null,
  );
  if (open && openedFor !== currentCollectionId) {
    setOpenedFor(currentCollectionId);
    setTarget(currentCollectionId);
    setError('');
  }

  async function handleMove(): Promise<void> {
    setError('');
    try {
      await onMove(target);
      onOpenChange(false);
    } catch (caught) {
      // Shown here rather than behind the dialog: the answer to "did it
      // work" belongs where the question was asked.
      setError(actionErrorMessage(caught, t('pages.moveToCollection.failed')));
    }
  }

  const options = [
    { id: null, name: t('pages.moveToCollection.none'), icon: null },
    ...(collections ?? []).map((collection) => ({
      id: collection.id as string | null,
      name: collection.name,
      icon: collection.icon ?? null,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pages.moveToCollection.title')}</DialogTitle>
          <DialogDescription>
            {t('pages.moveToCollection.description', { name: pageTitle })}
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex max-h-72 flex-col gap-1 overflow-y-auto"
          role="radiogroup"
          aria-label={t('pages.moveToCollection.title')}
        >
          {options.map((option) => (
            <label
              key={option.id ?? 'none'}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted',
                target === option.id && 'bg-muted',
              )}
            >
              <input
                type="radio"
                name="collection"
                className="sr-only"
                checked={target === option.id}
                onChange={() => setTarget(option.id)}
              />
              {option.icon ? (
                <CollectionIcon
                  name={option.icon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
              ) : (
                <Files className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{option.name}</span>
            </label>
          ))}
        </div>
        {error && <InlineError>{error}</InlineError>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={isMoving || target === currentCollectionId}
            onClick={() => void handleMove()}
          >
            {t('pages.moveToCollection.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
