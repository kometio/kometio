import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import {
  useNavigationBlocker,
  useUnsavedChangesGuard,
} from '../common/use-unsaved-changes-guard';

export interface SaveBarProps {
  /** Whether the form holds anything the server does not: the bar is on screen only then. */
  isDirty: boolean;
  isSaving: boolean;
  /** False while what the form holds cannot be sent: the bar stays (there is still something to lose), and Save waits. */
  canSave?: boolean;
  /** Puts the form back to the values that were saved. */
  onCancel: () => void;
  /**
   * What Save does when the bar is not inside a `<form>`. Inside one it is
   * the form's own submit button, so Enter in a field and the button end
   * up in the same place.
   */
  onSave?: () => void;
}

/**
 * The one way a settings screen saves: nothing at the foot of the form
 * until something has changed, and then a bar that says so, with Cancel
 * and Save. It is the only filled button on such a screen, and it stays in
 * view — `sticky` inside the content column — however long the form is.
 *
 * It also answers for leaving: a screen with a Save button that is not
 * pressed loses its work on a reload, on a link, or on a click into the
 * next section, so the browser is asked for the first and the app's own
 * dialog for the others. Nothing here saves itself.
 */
export function SaveBar({
  isDirty,
  isSaving,
  canSave = true,
  onCancel,
  onSave,
}: SaveBarProps) {
  const { t } = useTranslation();
  useUnsavedChangesGuard({ hasUnsavedChanges: isDirty });
  const guard = useNavigationBlocker(isDirty);

  return (
    <>
      {/* A live region that is always there, so that the bar appearing is
          said to a screen reader rather than being a change it never
          hears about. */}
      <div role="status" className="sticky bottom-4 z-10">
        {isDirty && (
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-md">
            {/* The dot is the colour and the words are the message: a
                state is never colour alone. */}
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-2 rounded-full bg-warning" />
              {t('saveBar.unsaved')}
            </span>
            <span className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                onClick={onCancel}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type={onSave ? 'button' : 'submit'}
                disabled={isSaving || !canSave}
                onClick={onSave}
              >
                {isSaving ? t('common.saving') : t('common.save')}
              </Button>
            </span>
          </div>
        )}
      </div>
      <ConfirmActionDialog
        open={guard.isBlocked}
        onOpenChange={(open) => !open && guard.stay()}
        title={t('saveBar.leaveTitle')}
        description={t('saveBar.leaveBody')}
        onConfirm={guard.proceed}
        actionLabel={t('saveBar.leaveAction')}
      />
    </>
  );
}
