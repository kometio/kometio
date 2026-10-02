import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MIN_PASSWORD_LENGTH } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { AuthPage } from './auth-page';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useResetPassword } from './use-reset-password';
import { InlineError } from '../../components/ui/inline-error';

export interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const mutation = useResetPassword(token);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(newPassword);
  }

  return (
    <AuthPage
      title={t('auth.resetPassword.title')}
      description={t('auth.resetPassword.description')}
    >
      {mutation.status === 'success' ? (
        <p className="text-sm text-muted-foreground">
          {t('auth.resetPassword.doneMessage')}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">
              {t('auth.resetPassword.newPasswordLabel')}
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          {mutation.status === 'error' && (
            <InlineError>{t('auth.resetPassword.error')}</InlineError>
          )}
          <Button
            type="submit"
            disabled={mutation.status === 'pending'}
            className="w-full"
          >
            {mutation.status === 'pending'
              ? t('auth.resetPassword.submitPending')
              : t('auth.resetPassword.submitIdle')}
          </Button>
        </form>
      )}
    </AuthPage>
  );
}
