import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { InlineError } from '../../components/ui/inline-error';
import { Label } from '../../components/ui/label';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import type { RequestEmailChangeInput } from '../../lib/account-api-client';
import { useServerSendsEmail } from '../common/deployment-queries';
import { PasswordField } from './password-field';

export interface ChangeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The address they sign in with now. */
  currentEmail: string;
  onRequestEmailChange: (input: RequestEmailChangeInput) => Promise<void>;
}

interface Problems {
  email?: string;
  password?: string;
  form?: string;
}

/** Just enough to catch a typo before asking the server; the server has the last word. */
function looksLikeAnEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
  onRequestEmailChange,
}: ChangeEmailDialogProps) {
  const { t } = useTranslation();
  const emailId = useId();
  // "We sent a link" is only true when the server can send: without a mail
  // server the link is in its log, and the dialog says that instead.
  const sendsEmail = useServerSendsEmail();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problems, setProblems] = useState<Problems>({});
  const [submitting, setSubmitting] = useState(false);
  // The address the link went to: once it is set, the dialog says so
  // instead of asking again.
  const [sentTo, setSentTo] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEmail('');
      setPassword('');
      setProblems({});
      setSentTo(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const typed = email.trim();
    const found: Problems = {};
    if (!looksLikeAnEmail(typed)) {
      found.email = t('account.emailDialog.invalid');
    } else if (typed === currentEmail) {
      found.email = t('account.emailDialog.unchanged');
    }
    if (password === '') {
      found.password = t('account.currentPasswordRequired');
    }
    setProblems(found);
    if (found.email || found.password) return;

    setSubmitting(true);
    try {
      await onRequestEmailChange({
        newEmail: typed,
        currentPassword: password,
      });
      setPassword('');
      setSentTo(typed);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setProblems({ password: t('account.wrongCurrentPassword') });
      } else if (err instanceof ApiError && err.status === 409) {
        setProblems({ email: t('account.emailDialog.taken') });
      } else if (err instanceof ApiError && err.status === 429) {
        setProblems({ form: t('account.tooManyTries') });
      } else if (err instanceof ApiError && err.status === 400) {
        // The address itself was refused: the server's own sentence when it
        // gave one, and the plain "not an address" when it named a field.
        setProblems({
          email: actionErrorMessage(err, t('account.emailDialog.invalid')),
        });
      } else {
        setProblems({
          form: actionErrorMessage(err, t('account.emailDialog.failed')),
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
          <DialogTitle>
            {sentTo
              ? t(
                  sendsEmail
                    ? 'account.emailDialog.sentTitle'
                    : 'account.emailDialog.sentNoEmailTitle',
                )
              : t('account.emailDialog.title')}
          </DialogTitle>
        </DialogHeader>
        {sentTo ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              {t(
                sendsEmail
                  ? 'account.emailDialog.sent'
                  : 'account.emailDialog.sentNoEmail',
                { email: sentTo, current: currentEmail },
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('account.emailDialog.sentNote')}
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor={emailId}>
                {t('account.emailDialog.newEmail')}
              </Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                autoComplete="email"
                autoFocus
                aria-invalid={problems.email ? true : undefined}
                aria-describedby={
                  problems.email
                    ? `${emailId}-hint ${emailId}-error`
                    : `${emailId}-hint`
                }
                onChange={(event) => setEmail(event.target.value)}
              />
              <p
                id={`${emailId}-hint`}
                className="text-xs text-muted-foreground"
              >
                {t('account.emailDialog.newEmailHint')}
              </p>
              <InlineError id={`${emailId}-error`}>
                {problems.email}
              </InlineError>
            </div>
            <PasswordField
              label={t('account.currentPassword')}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              hint={t('account.emailDialog.currentPasswordHint')}
              error={problems.password}
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
                  ? t('account.emailDialog.busy')
                  : t('account.emailDialog.submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
