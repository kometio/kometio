import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SecondFactorEnrolment } from '@kometio/api-contracts';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { PasswordField } from './password-field';
import { QrCode } from './qr-code';
import { RecoveryCodesPanel } from './recovery-codes-panel';

export interface EnableSecondFactorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBegin: (password: string) => Promise<SecondFactorEnrolment>;
  onConfirm: (code: string) => Promise<{ recoveryCodes: string[] }>;
}

type Step =
  | { name: 'password' }
  | { name: 'scan'; enrolment: SecondFactorEnrolment }
  | { name: 'codes'; codes: string[] };

/**
 * Turning the second step on, in three steps in one dialog (docs/adr/0137):
 * the password, the secret to put in the app and the first code it shows,
 * and the recovery codes.
 *
 * Nothing is on until the middle step is passed: a secret that never reached
 * an app must not lock the person out at the next sign-in. Closing the dialog
 * anywhere before that leaves the account as it was.
 */
export function EnableSecondFactorDialog({
  open,
  onOpenChange,
  onBegin,
  onConfirm,
}: EnableSecondFactorDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ name: 'password' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // A fresh dialog every time: a password, a secret or a code typed once is
  // not there the next time it opens.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setStep({ name: 'password' });
      setPassword('');
      setCode('');
      setSaved(false);
      setFieldError('');
      setFormError('');
    }
    onOpenChange(next);
  }

  async function handlePassword(event: FormEvent) {
    event.preventDefault();
    if (password === '') {
      setFieldError(t('account.currentPasswordRequired'));
      return;
    }
    setFieldError('');
    setFormError('');
    setSubmitting(true);
    try {
      setStep({ name: 'scan', enrolment: await onBegin(password) });
      setPassword('');
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setFieldError(t('account.wrongCurrentPassword'));
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(t('account.tooManyTries'));
      } else if (error instanceof ApiError && error.status === 409) {
        setFormError(t('account.secondFactor.alreadyOn'));
      } else {
        setFormError(
          actionErrorMessage(error, t('account.secondFactor.failed')),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCode(event: FormEvent) {
    event.preventDefault();
    if (code.trim() === '') {
      setFieldError(t('account.secondFactor.codeRequired'));
      return;
    }
    setFieldError('');
    setFormError('');
    setSubmitting(true);
    try {
      const { recoveryCodes } = await onConfirm(code);
      setStep({ name: 'codes', codes: recoveryCodes });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setFieldError(t('account.secondFactor.codeMismatch'));
      } else if (error instanceof ApiError && error.status === 409) {
        // Another tab finished it, or began again: the secret on screen is
        // not the one that is kept any more.
        setFormError(t('account.secondFactor.startAgain'));
      } else {
        setFormError(
          actionErrorMessage(error, t('account.secondFactor.failed')),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('account.secondFactor.enableTitle')}</DialogTitle>
          <DialogDescription>
            {step.name === 'password' && t('account.secondFactor.passwordStep')}
            {step.name === 'scan' && t('account.secondFactor.scanStep')}
            {step.name === 'codes' && t('account.secondFactor.codesStep')}
          </DialogDescription>
        </DialogHeader>

        {step.name === 'password' && (
          <form
            onSubmit={(event) => void handlePassword(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <PasswordField
              label={t('account.currentPassword')}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              error={fieldError}
              autoFocus
            />
            <InlineError>{formError}</InlineError>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {t('account.secondFactor.continue')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.name === 'scan' && (
          <form
            onSubmit={(event) => void handleCode(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <QrCode
                value={step.enrolment.provisioningUri}
                label={t('account.secondFactor.qrLabel')}
              />
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="text-muted-foreground">
                  {t('account.secondFactor.keyLabel')}
                </span>
                <code className="font-mono text-xs break-all select-all">
                  {step.enrolment.secret}
                </code>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="second-factor-confirm">
                {t('account.secondFactor.codeLabel')}
              </Label>
              <Input
                id="second-factor-confirm"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="font-mono"
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={
                  fieldError ? 'second-factor-confirm-error' : undefined
                }
              />
              <InlineError id="second-factor-confirm-error">
                {fieldError}
              </InlineError>
            </div>
            <InlineError>{formError}</InlineError>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {t('account.secondFactor.turnOn')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.name === 'codes' && (
          <div className="flex flex-col gap-4">
            <RecoveryCodesPanel
              codes={step.codes}
              saved={saved}
              onSavedChange={setSaved}
            />
            <DialogFooter>
              <Button
                type="button"
                disabled={!saved}
                onClick={() => handleOpenChange(false)}
              >
                {t('account.secondFactor.done')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
