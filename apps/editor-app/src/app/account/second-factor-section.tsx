import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { useToast } from '../shell/toast-provider';
import { EnableSecondFactorDialog } from './enable-second-factor-dialog';
import { PasswordConfirmDialog } from './password-confirm-dialog';
import { RecoveryCodesPanel } from './recovery-codes-panel';
import { useSecondFactor } from './use-second-factor';

/**
 * Two-step verification on the account (docs/adr/0137): whether it is on,
 * and what can be done about it — turn it on, get new recovery codes, turn
 * it off.
 *
 * It draws nothing where the server cannot ask for a second step (no place to
 * keep a secret sealed), and nothing while the answer is not known: a
 * control that might lead nowhere is worse than none (DESIGN.md §4).
 */
export function SecondFactorSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const headingId = useId();
  const { status, begin, confirm, regenerateRecoveryCodes, disable } =
    useSecondFactor();
  const [dialog, setDialog] = useState<
    'enable' | 'new-codes' | 'disable' | null
  >(null);
  // The codes a person has just asked for again, shown until they say they
  // have kept them.
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [newCodesSaved, setNewCodesSaved] = useState(false);

  if (!status?.available) return null;

  function closeNewCodes() {
    setNewCodes(null);
    setNewCodesSaved(false);
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-sm font-medium">
        {t('account.secondFactor.title')}
      </h2>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <dl className="min-w-0 text-sm">
          <dt className="flex items-center gap-2 text-muted-foreground">
            {t('account.secondFactor.statusLabel')}
            <Badge variant={status.enabled ? 'success' : 'secondary'}>
              {status.enabled
                ? t('account.secondFactor.on')
                : t('account.secondFactor.off')}
            </Badge>
          </dt>
          <dd>
            {status.enabled
              ? t('account.secondFactor.onHint', {
                  count: status.recoveryCodesLeft,
                })
              : t('account.secondFactor.offHint')}
          </dd>
        </dl>
        {status.enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialog('new-codes')}
            >
              {t('account.secondFactor.newCodes')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialog('disable')}
            >
              {t('account.secondFactor.turnOff')}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialog('enable')}
          >
            {t('account.secondFactor.turnOnAction')}
          </Button>
        )}
      </div>

      <EnableSecondFactorDialog
        open={dialog === 'enable'}
        onOpenChange={(open) => setDialog(open ? 'enable' : null)}
        onBegin={begin}
        onConfirm={confirm}
      />
      <PasswordConfirmDialog
        open={dialog === 'new-codes'}
        onOpenChange={(open) => setDialog(open ? 'new-codes' : null)}
        title={t('account.secondFactor.newCodesTitle')}
        description={t('account.secondFactor.newCodesDescription')}
        submitLabel={t('account.secondFactor.newCodesSubmit')}
        onConfirm={async (password) => {
          const { recoveryCodes } = await regenerateRecoveryCodes(password);
          setNewCodes(recoveryCodes);
        }}
      />
      <PasswordConfirmDialog
        open={dialog === 'disable'}
        onOpenChange={(open) => setDialog(open ? 'disable' : null)}
        title={t('account.secondFactor.disableTitle')}
        description={t('account.secondFactor.disableDescription')}
        submitLabel={t('account.secondFactor.disableSubmit')}
        destructive
        onConfirm={async (password) => {
          await disable(password);
          toast(t('account.secondFactor.disabled'), 'success');
        }}
      />
      <Dialog
        open={newCodes !== null}
        onOpenChange={(open) => {
          if (!open) closeNewCodes();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.secondFactor.newCodesTitle')}</DialogTitle>
          </DialogHeader>
          {newCodes && (
            <RecoveryCodesPanel
              codes={newCodes}
              saved={newCodesSaved}
              onSavedChange={setNewCodesSaved}
            />
          )}
          <DialogFooter>
            <Button
              type="button"
              disabled={!newCodesSaved}
              onClick={closeNewCodes}
            >
              {t('account.secondFactor.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
