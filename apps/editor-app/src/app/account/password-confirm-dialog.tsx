import { useState, type FormEvent, type ReactNode } from 'react';
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
import { InlineError } from '../../components/ui/inline-error';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { PasswordField } from './password-field';

export interface PasswordConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  /** Red, for what takes something away. */
  destructive?: boolean;
  onConfirm: (password: string) => Promise<void>;
  /** Anything the caller wants under the field: a warning of what will happen. */
  children?: ReactNode;
}

/**
 * Asks for the password again before something that adds, replaces or removes
 * a way into the account: new recovery codes, turning the second step off.
 * A wrong password is said under the field (403), and a person who has
 * tried too often is told to wait (429); both leave what was typed.
 */
export function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  destructive = false,
  onConfirm,
  children,
}: PasswordConfirmDialogProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPassword('');
      setFieldError('');
      setFormError('');
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password === '') {
      setFieldError(t('account.currentPasswordRequired'));
      return;
    }
    setFieldError('');
    setFormError('');
    setSubmitting(true);
    try {
      await onConfirm(password);
      handleOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setFieldError(t('account.wrongCurrentPassword'));
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(t('account.tooManyTries'));
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
          noValidate
        >
          {children}
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
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={submitting}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
