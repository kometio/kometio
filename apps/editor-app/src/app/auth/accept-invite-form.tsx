import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MIN_PASSWORD_LENGTH } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { AuthPage } from './auth-page';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useAcceptInvite } from './use-accept-invite';
import { InlineError } from '../../components/ui/inline-error';

export interface AcceptInviteFormProps {
  token: string;
}

export function AcceptInviteForm({ token }: AcceptInviteFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const mutation = useAcceptInvite(token);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(password);
  }

  return (
    <AuthPage
      title={t('auth.acceptInvite.title')}
      description={t('auth.acceptInvite.description')}
    >
      {mutation.status === 'success' ? (
        <p className="text-sm text-muted-foreground">
          {t('auth.acceptInvite.doneMessage')}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-password">
              {t('auth.acceptInvite.passwordLabel')}
            </Label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          {mutation.status === 'error' && (
            <InlineError>{t('auth.acceptInvite.error')}</InlineError>
          )}
          <Button
            type="submit"
            disabled={mutation.status === 'pending'}
            className="w-full"
          >
            {mutation.status === 'pending'
              ? t('auth.acceptInvite.submitPending')
              : t('auth.acceptInvite.submitIdle')}
          </Button>
        </form>
      )}
    </AuthPage>
  );
}
