import { useTranslation } from 'react-i18next';
import { AuthPage } from './auth-page';
import { useVerifyEmail } from './use-verify-email';
import { InlineError } from '../../components/ui/inline-error';

export interface VerifyEmailViewProps {
  token: string;
}

export function VerifyEmailView({ token }: VerifyEmailViewProps) {
  const { t } = useTranslation();
  const status = useVerifyEmail(token);

  return (
    <AuthPage
      title={t('auth.verifyEmail.title')}
      description={t('auth.verifyEmail.description')}
    >
      {(status === 'idle' || status === 'pending') && (
        <p className="text-sm text-muted-foreground">
          {t('auth.verifyEmail.pending')}
        </p>
      )}
      {status === 'success' && (
        <p className="text-sm text-muted-foreground">
          {t('auth.verifyEmail.success')}
        </p>
      )}
      {status === 'error' && (
        <InlineError>{t('auth.verifyEmail.error')}</InlineError>
      )}
    </AuthPage>
  );
}
