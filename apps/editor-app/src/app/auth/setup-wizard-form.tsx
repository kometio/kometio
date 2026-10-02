import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/http-client';
import {
  CURATED_LOCALE_CODES,
  getLocaleDisplayName,
  MIN_ADMIN_PASSWORD_LENGTH,
} from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { AuthPage } from './auth-page';
import { Input } from '../../components/ui/input';
import { OptionsSelect } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { InlineError } from '../../components/ui/inline-error';

/** Mirrors the server's own minimum (setup.schemas.ts) so the field can say so before submitting. */

/**
 * The locale the language field starts on. Exported so a test can assert it
 * is actually one of `CURATED_LOCALE_CODES` — the pairing that broke once
 * already, see the comment where it is used.
 */
export const DEFAULT_SETUP_LOCALE = 'en-US';

export interface SetupWizardFormProps {
  onSubmit: (input: {
    setupToken: string;
    siteName: string;
    defaultLocale: string;
    adminEmail: string;
    adminPassword: string;
  }) => Promise<void>;
}

/**
 * The first screen a self-hosted Kometio ever shows. Deliberately short:
 * everything else — the domain, SMTP, the theme, more users — is reachable
 * and changeable from the editor afterwards, and asking for it here would
 * mean asking someone to make decisions before they have seen the product.
 *
 * The exception is the setup token, which is not a preference but a gate:
 * without it, whoever loads this page first becomes the administrator of
 * somebody else's installation. It goes first because a wrong one makes
 * the rest of the form pointless.
 *
 * No captcha, unlike login. A captcha proves "not a robot"; the token
 * proves something far stronger — that you can read this server's logs.
 * Turnstile's keys also live in the same env file the wizard exists to
 * avoid needing.
 */
export function SetupWizardForm({ onSubmit }: SetupWizardFormProps) {
  const { t } = useTranslation();
  const [setupToken, setSetupToken] = useState('');
  const [siteName, setSiteName] = useState('');
  // Must be a member of CURATED_LOCALE_CODES, which holds full BCP-47 tags
  // and no bare 'en'. A `value` matching no `<option>` makes the browser
  // display the FIRST one — Arabic — while React's state stays what it was:
  // someone who actually wanted Arabic saw it already selected, submitted
  // without touching it, and got a site in English.
  const [defaultLocale, setDefaultLocale] =
    useState<string>(DEFAULT_SETUP_LOCALE);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        setupToken,
        siteName,
        defaultLocale,
        adminEmail,
        adminPassword,
      });
    } catch (err) {
      // A rejected token IS worth mapping, unlike everything else here: it
      // is the one failure the person can act on, and the action (re-read
      // the log) is not guessable. Everything else — API unreachable,
      // already set up — means "try again / reload", not "fix this field".
      setError(
        err instanceof ApiError && err.status === 401
          ? t('setup.tokenError')
          : t('setup.genericError'),
      );
      setSubmitting(false);
    }
  }

  const passwordTooShort =
    adminPassword.length > 0 &&
    adminPassword.length < MIN_ADMIN_PASSWORD_LENGTH;

  return (
    <AuthPage
      title={t('setup.title')}
      description={t('setup.description')}
      width="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="setup-token">{t('setup.tokenLabel')}</Label>
          <Input
            id="setup-token"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-describedby="setup-token-hint"
          />
          <p id="setup-token-hint" className="text-muted-foreground text-xs">
            {t('setup.tokenHint')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="setup-site-name">{t('setup.siteNameLabel')}</Label>
          <Input
            id="setup-site-name"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            required
            maxLength={120}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="setup-locale">{t('setup.localeLabel')}</Label>
          <OptionsSelect
            id="setup-locale"
            value={defaultLocale}
            onValueChange={setDefaultLocale}
            options={CURATED_LOCALE_CODES.map((code) => ({
              value: code,
              label: getLocaleDisplayName(code),
            }))}
          />
          <p className="text-muted-foreground text-xs">
            {t('setup.localeHint')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="setup-email">{t('setup.emailLabel')}</Label>
          <Input
            id="setup-email"
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="setup-password">{t('setup.passwordLabel')}</Label>
          <Input
            id="setup-password"
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
            minLength={MIN_ADMIN_PASSWORD_LENGTH}
            aria-describedby="setup-password-hint"
          />
          <p
            id="setup-password-hint"
            className={
              passwordTooShort
                ? 'text-destructive text-xs'
                : 'text-muted-foreground text-xs'
            }
          >
            {t('setup.passwordHint', { count: MIN_ADMIN_PASSWORD_LENGTH })}
          </p>
        </div>

        {error && <InlineError>{error}</InlineError>}

        <Button type="submit" disabled={submitting}>
          {submitting ? t('setup.submitPending') : t('setup.submitIdle')}
        </Button>
      </form>
    </AuthPage>
  );
}
