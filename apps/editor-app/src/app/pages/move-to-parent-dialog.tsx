import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { actionErrorMessage } from '../../lib/http-client';
import { PageParentSelect } from './page-parent-select';
import { InlineError } from '../../components/ui/inline-error';

export interface MoveToParentDialogProps {
  siteId: string;
  /** Whose titles the choice lists — the site's default language. */
  defaultLocale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown in the question, so it is clear which page is about to move. */
  pageTitle: string;
  pageGroupId: string;
  /** Where it hangs today — `null` at the top level. */
  currentParentId: string | null;
  onMove: (parentId: string | null) => Promise<unknown>;
  isMoving: boolean;
}

/**
 * Where a page hangs in the site's tree.
 *
 * Unlike moving it to a collection, this changes the address — the page's
 * own and that of everything under it. The old address is not lost: it
 * answers with a 301 afterwards (docs/adr/0074), and the text says so,
 * because "will this break my links" is the question anyone hesitates
 * over before moving a page.
 */
export function MoveToParentDialog({
  siteId,
  defaultLocale,
  open,
  onOpenChange,
  pageTitle,
  pageGroupId,
  currentParentId,
  onMove,
  isMoving,
}: MoveToParentDialogProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(currentParentId);
  const [error, setError] = useState('');

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setChosen(currentParentId);
      setError('');
    }
    onOpenChange(nextOpen);
  }

  async function handleMove() {
    setError('');
    try {
      await onMove(chosen);
      handleOpenChange(false);
    } catch (err) {
      setError(actionErrorMessage(err, t('pages.moveToParent.failed')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pages.moveToParent.title')}</DialogTitle>
          <DialogDescription>
            {t('pages.moveToParent.description', { name: pageTitle })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="move-to-parent">{t('pages.parent.label')}</Label>
          <PageParentSelect
            id="move-to-parent"
            siteId={siteId}
            locale={defaultLocale}
            value={chosen}
            onChange={setChosen}
            excludeSubtreeOf={pageGroupId}
            disabled={isMoving}
            className="w-full"
          />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('pages.moveToParent.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleMove()}
            disabled={isMoving || chosen === currentParentId}
          >
            {t('pages.moveToParent.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
