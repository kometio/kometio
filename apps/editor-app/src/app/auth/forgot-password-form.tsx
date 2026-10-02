import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { AuthPage } from './auth-page';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { TURNSTILE_SITE_KEY } from '../../lib/turnstile-site-key';
import { TurnstileWidget } from './turnstile-widget';
import { useForgotPasswordRequest } from './use-forgot-password-request';

export interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const { t } = useTranslation();
  const { requestReset, isSubmitting } = useForgotPasswordRequest();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!captchaToken) {
      return;
    }
    await requestReset(email, captchaToken);
    setSent(true);
  }

  return (
    <AuthPage
      title={t('auth.forgotPassword.title')}
      description={t('auth.forgotPassword.description')}
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t('auth.forgotPassword.sentMessage')}
          </p>
          <Button
            variant="link"
            className="self-start px-0"
            onClick={onBackToLogin}
          >
            {t('auth.forgotPassword.backToLogin')}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="forgot-email">{t('auth.login.emailLabel')}</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <TurnstileWidget
            siteKey={TURNSTILE_SITE_KEY}
            onToken={setCaptchaToken}
          />
          <Button
            type="submit"
            disabled={isSubmitting || !captchaToken}
            className="w-full"
          >
            {isSubmitting
              ? t('auth.forgotPassword.submitPending')
              : t('auth.forgotPassword.submitIdle')}
          </Button>
          <Button
            type="button"
            variant="link"
            className="self-center px-0"
            onClick={onBackToLogin}
          >
            {t('auth.forgotPassword.backToLogin')}
          </Button>
        </form>
      )}
    </AuthPage>
  );
}
