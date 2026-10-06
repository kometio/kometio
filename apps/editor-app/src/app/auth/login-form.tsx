import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { AuthPage } from './auth-page';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { CaptchaWidget } from './captcha-widget';
import { InlineError } from '../../components/ui/inline-error';

export interface LoginFormProps {
  /** The site was just opened from an archive: say that the accounts came with it. */
  imported?: boolean;
  onLogin: (
    email: string,
    password: string,
    captchaToken: string,
  ) => Promise<void>;
  onForgotPassword: () => void;
}

export function LoginForm({
  imported = false,
  onLogin,
  onForgotPassword,
}: LoginFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Incremented after a rejected attempt to force a fresh challenge — the
  // widget still shows "verified" for the OLD token even though the server
  // has already refused it (single-use), see TurnstileWidget's own doc
  // comment.
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!captchaToken) {
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onLogin(email, password, captchaToken);
    } catch {
      setError(t('auth.login.invalidCredentials'));
      setCaptchaToken(null);
      setCaptchaResetSignal((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPage
      title={t('auth.login.title')}
      description={t('auth.login.description')}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {imported && (
          <p role="status" className="text-sm">
            {t('auth.login.imported')}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-email">{t('auth.login.emailLabel')}</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login-password">
            {t('auth.login.passwordLabel')}
          </Label>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <CaptchaWidget
          onToken={setCaptchaToken}
          resetSignal={captchaResetSignal}
        />
        {error && <InlineError>{error}</InlineError>}
        <Button
          type="submit"
          disabled={submitting || !captchaToken}
          className="w-full"
        >
          {submitting
            ? t('auth.login.submitPending')
            : t('auth.login.submitIdle')}
        </Button>
        <Button
          type="button"
          variant="link"
          className="self-center px-0"
          onClick={onForgotPassword}
        >
          {t('auth.login.forgotPassword')}
        </Button>
      </form>
    </AuthPage>
  );
}
