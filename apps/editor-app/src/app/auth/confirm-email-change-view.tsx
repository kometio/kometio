import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { AuthPage } from './auth-page';
import { InlineError } from '../../components/ui/inline-error';
import { useConfirmEmailChange } from './use-confirm-email-change';

export interface ConfirmEmailChangeViewProps {
  token: string;
}

export function ConfirmEmailChangeView({ token }: ConfirmEmailChangeViewProps) {
  const { t } = useTranslation();
  const status = useConfirmEmailChange(token);

  return (
    <AuthPage
      title={t('auth.confirmEmailChange.title')}
      description={t('auth.confirmEmailChange.description')}
    >
      <div className="flex flex-col gap-4">
        {(status === 'idle' || status === 'pending') && (
          <p className="text-sm text-muted-foreground">
            {t('auth.confirmEmailChange.pending')}
          </p>
        )}
        {status === 'success' && (
          <p className="text-sm text-muted-foreground">
            {t('auth.confirmEmailChange.success')}
          </p>
        )}
        {status === 'error' && (
          <InlineError>{t('auth.confirmEmailChange.error')}</InlineError>
        )}
        {(status === 'success' || status === 'error') && (
          <Button
            asChild
            variant={status === 'success' ? 'default' : 'outline'}
          >
            <Link to="/account">{t('auth.confirmEmailChange.toEditor')}</Link>
          </Button>
        )}
      </div>
    </AuthPage>
  );
}
