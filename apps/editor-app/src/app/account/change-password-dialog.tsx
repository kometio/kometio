import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MIN_PASSWORD_LENGTH } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import type { ChangePasswordInput } from '../../lib/account-api-client';
import { useToast } from '../shell/toast-provider';
import { PasswordField } from './password-field';

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChangePassword: (input: ChangePasswordInput) => Promise<void>;
}

/** What is wrong, and under which field it is said. */
interface Problems {
  current?: string;
  next?: string;
  repeat?: string;
  form?: string;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onChangePassword,
}: ChangePasswordDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problems, setProblems] = useState<Problems>({});
  const [submitting, setSubmitting] = useState(false);

  // A fresh form on every close, whatever caused it: nobody should find a
  // password they typed still there the next time it opens.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCurrent('');
      setNext('');
      setRepeat('');
      setProblems({});
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Problems = {};
    if (current === '') {
      found.current = t('account.currentPasswordRequired');
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      found.next = t('account.passwordDialog.tooShort', {
        min: MIN_PASSWORD_LENGTH,
      });
    } else if (repeat !== next) {
      found.repeat = t('account.passwordDialog.mismatch');
    }
    setProblems(found);
    if (found.current || found.next || found.repeat) return;

    setSubmitting(true);
    try {
      await onChangePassword({ currentPassword: current, newPassword: next });
      toast(t('account.passwordDialog.done'), 'success');
      handleOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setProblems({ current: t('account.wrongCurrentPassword') });
      } else if (err instanceof ApiError && err.status === 429) {
        setProblems({ form: t('account.tooManyTries') });
      } else {
        setProblems({
          form: actionErrorMessage(err, t('account.passwordDialog.failed')),
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('account.passwordDialog.title')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
          noValidate
        >
          <PasswordField
            label={t('account.currentPassword')}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            error={problems.current}
            autoFocus
          />
          <PasswordField
            label={t('account.passwordDialog.newPassword')}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            hint={t('account.passwordDialog.newPasswordHint', {
              min: MIN_PASSWORD_LENGTH,
            })}
            error={problems.next}
          />
          <PasswordField
            label={t('account.passwordDialog.repeatPassword')}
            value={repeat}
            onChange={setRepeat}
            autoComplete="new-password"
            error={problems.repeat}
          />
          <InlineError>{problems.form}</InlineError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t('account.passwordDialog.busy')
                : t('account.passwordDialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
