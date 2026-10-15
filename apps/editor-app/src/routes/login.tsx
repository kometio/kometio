import { useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ForgotPasswordForm } from '../app/auth/forgot-password-form';
import { LoginForm } from '../app/auth/login-form';
import { SecondFactorForm } from '../app/auth/second-factor-form';
import { useSession } from '../app/auth/use-session';
import { useToast } from '../app/shell/toast-provider';
import { fetchSetupStatus } from '../lib/setup-api-client';

export const Route = createFileRoute('/login')({
  // `imported` is where the first-run screen sends somebody whose site has just
  // been opened from an archive (docs/adr/0106); anything else is no notice.
  validateSearch: z.object({
    imported: z.boolean().optional().catch(undefined),
  }),
  // A deployment nobody has set up yet has no account to log into, so
  // showing this form would be showing a door with no key. The wizard's own
  // route sends people back here once it has run, so the two guards are a
  // pair rather than a redirect loop.
  beforeLoad: async () => {
    const { hasBeenSetUp } = await fetchSetupStatus();
    if (!hasBeenSetUp) {
      throw redirect({ to: '/setup' });
    }
  },
  component: LoginRoute,
});

/** A person who is down to this many recovery codes is told so at the door, when one was just used. */
const FEW_RECOVERY_CODES = 3;

function LoginRoute() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { handleLogin, handleSecondFactor } = useSession();
  const navigate = useNavigate();
  const { imported } = Route.useSearch();
  const [view, setView] = useState<
    'login' | 'forgot-password' | 'second-factor'
  >('login');
  const [challenge, setChallenge] = useState('');

  async function onLogin(
    email: string,
    password: string,
    captchaToken: string,
  ) {
    const answer = await handleLogin(email, password, captchaToken);
    if ('secondFactorRequired' in answer) {
      // The password was right and nobody is signed in yet: the code is next.
      setChallenge(answer.challenge);
      setView('second-factor');
      return;
    }
    await navigate({ to: '/pages' });
  }

  async function onSecondFactor(challengeToAnswer: string, code: string) {
    const { recoveryCodesLeft } = await handleSecondFactor(
      challengeToAnswer,
      code,
    );
    if (recoveryCodesLeft !== null) {
      toast(
        t('auth.secondFactor.recoveryCodeUsed', { count: recoveryCodesLeft }),
        recoveryCodesLeft <= FEW_RECOVERY_CODES ? 'destructive' : 'default',
      );
    }
    await navigate({ to: '/pages' });
  }

  if (view === 'second-factor') {
    return (
      <SecondFactorForm
        challenge={challenge}
        onSubmit={onSecondFactor}
        onStartAgain={() => setView('login')}
      />
    );
  }

  if (view === 'forgot-password') {
    return <ForgotPasswordForm onBackToLogin={() => setView('login')} />;
  }
  return (
    <LoginForm
      imported={imported === true}
      onLogin={onLogin}
      onForgotPassword={() => setView('forgot-password')}
    />
  );
}
