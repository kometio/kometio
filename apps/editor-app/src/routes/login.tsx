import { useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ForgotPasswordForm } from '../app/auth/forgot-password-form';
import { LoginForm } from '../app/auth/login-form';
import { useSession } from '../app/auth/use-session';
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

function LoginRoute() {
  const { handleLogin } = useSession();
  const navigate = useNavigate();
  const { imported } = Route.useSearch();
  const [view, setView] = useState<'login' | 'forgot-password'>('login');

  async function onLogin(
    email: string,
    password: string,
    captchaToken: string,
  ) {
    await handleLogin(email, password, captchaToken);
    await navigate({ to: '/pages' });
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
