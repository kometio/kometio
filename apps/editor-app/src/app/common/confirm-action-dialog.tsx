import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already resolved via t() by the caller — title/description text (and
   * the {{name}} interpolation) differ per resource type, but "Annulla"
   * never did (security review 2026-08-24: 3 delete dialogs, identical
   * character-for-character except this — a 4th, non-delete confirmation
   * (diverge a translation) later generalized this component instead of
   * duplicating it again). */
  title: string;
  description: string;
  onConfirm: () => void;
  /** Defaults to t('common.delete') — pass a different verb for a non-delete confirmation (e.g. "Scollega"). */
  actionLabel?: string;
  /** Defaults to 'destructive' — pass 'default' for a confirmation that isn't itself destructive/irreversible-looking in red. */
  actionVariant?: 'destructive' | 'default';
  /**
   * For a question whose answer is "not yet": the description says why, and
   * the action waits (Cancel is still there). Better than letting somebody
   * press it and be refused a second later.
   */
  actionDisabled?: boolean;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  actionLabel,
  actionVariant = 'destructive',
  actionDisabled = false,
}: ConfirmActionDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={actionVariant}
            disabled={actionDisabled}
            onClick={onConfirm}
          >
            {actionLabel ?? t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
