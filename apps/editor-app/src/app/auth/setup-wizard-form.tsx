import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/http-client';
import {
  CURATED_LOCALE_CODES,
  getLocaleDisplayName,
  isSiteDomain,
  MIN_ADMIN_PASSWORD_LENGTH,
} from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { AuthPage } from './auth-page';
import { Input } from '../../components/ui/input';
import { OptionsSelect } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { InlineError } from '../../components/ui/inline-error';
import { cleanDomainInput } from '../settings/domain-input';

/** Mirrors the server's own minimum (setup.schemas.ts) so the field can say so before submitting. */

/**
 * The locale the language field starts on. Exported so a test can assert it
 * is actually one of `CURATED_LOCALE_CODES` — the pairing that broke once
 * already, see the comment where it is used.
 */
export const DEFAULT_SETUP_LOCALE = 'en-US';

export interface SetupWizardFormProps {
  /**
   * The domain the address field starts on: the hostname of the address this
   * deployment was told to serve the site on (`domainOfAddress`). Empty when
   * there is none worth proposing, and the field then starts empty.
   */
  proposedDomain?: string;
  onSubmit: (input: {
    setupToken: string;
    siteName: string;
    defaultLocale: string;
    /** `null` when the field was left empty: the admin will set it later. */
    domain: string | null;
    adminEmail: string;
    adminPassword: string;
  }) => Promise<void>;
}

/**
 * The first screen a self-hosted Kometio ever shows. Deliberately short:
 * everything else — SMTP, the theme, more users — is reachable and
 * changeable from the editor afterwards, and asking for it here would mean
 * asking someone to make decisions before they have seen the product.
 *
 * The site's domain is the one exception, and it is not a decision: the site
 * is found by it, so a site created without one answers "not found" at every
 * address until somebody works out where to set it. The deployment already
 * knows the address it serves the site on, so the field starts on that and
 * leaving it alone is the right answer; it is still a field, because the
 * proposal can be wrong (a proxy, a name not yet pointed here).
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
export function SetupWizardForm({
  onSubmit,
  proposedDomain = '',
}: SetupWizardFormProps) {
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
  const [domain, setDomain] = useState(proposedDomain);
  // What the last edit of the domain took out of what was typed, to say so
  // instead of changing the field silently (the Settings screen does the same).
  const [removed, setRemoved] = useState<string[]>([]);
  const [domainInvalid, setDomainInvalid] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // What is pasted is the address bar's: the scheme, the port and the path
  // come off as it goes in, and a line under the field says so.
  function handleDomainChange(value: string) {
    const cleaned = cleanDomainInput(value);
    setDomain(cleaned.domain);
    setRemoved(cleaned.removed);
    setDomainInvalid(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    // Empty is allowed ("set it later"); anything else must be a hostname,
    // judged here under the field rather than refused by the server with a
    // sentence the person cannot tie to it.
    const chosenDomain = domain.trim();
    if (chosenDomain !== '' && !isSiteDomain(chosenDomain)) {
      setDomainInvalid(true);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        setupToken,
        siteName,
        defaultLocale,
        domain: chosenDomain === '' ? null : chosenDomain,
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
          <Label htmlFor="setup-domain">{t('setup.domainLabel')}</Label>
          <Input
            id="setup-domain"
            value={domain}
            onChange={(e) => handleDomainChange(e.target.value)}
            placeholder={t('generalSettings.domainPlaceholder')}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={domainInvalid ? true : undefined}
            aria-describedby={
              domainInvalid
                ? 'setup-domain-error setup-domain-hint'
                : 'setup-domain-hint'
            }
          />
          {domainInvalid && (
            <InlineError id="setup-domain-error">
              {t('generalSettings.domainInvalid')}
            </InlineError>
          )}
          {removed.length > 0 && (
            <p role="status" className="text-muted-foreground text-xs">
              {t('generalSettings.domainRemoved', {
                removed: removed.map((piece) => `“${piece}”`).join(', '),
              })}
            </p>
          )}
          <p id="setup-domain-hint" className="text-muted-foreground text-xs">
            {t('setup.domainHint')}
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
