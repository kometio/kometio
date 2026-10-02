import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  authorPathSegment,
  getLocaleDisplayName,
  isCanonicalSlug,
  slugify,
} from '@kometio/shared-types';
import { type AccountProfile } from '@kometio/api-contracts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { ApiError } from '../../lib/http-client';
import { PUBLIC_SITE_URL } from '../../lib/public-site-url';
import { UserAvatar } from './user-avatar';
import { useAccountProfile } from './use-account-profile';
import { useAccountCredentials } from './use-account-credentials';
import { ChangeEmailDialog } from './change-email-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { SignInSection } from './sign-in-section';
import { PageHeader } from '../shell/page-header';
import { SaveBar } from '../settings/save-bar';
import { useToast } from '../shell/toast-provider';
import { InlineError } from '../../components/ui/inline-error';

/** The server's own limit (account.schemas.ts): a few lines, not an essay. */
const BIO_MAX_CHARS = 1000;

/** What the form holds of the profile, in the shape it is compared and put back in. */
interface ProfileDraft {
  displayName: string;
  slug: string;
  bio: Record<string, string>;
}

/** The profile as the form shows it: nothing missing, a bio line for every language the site publishes. */
function draftOf(profile: AccountProfile, locales: string[]): ProfileDraft {
  return {
    displayName: profile.displayName ?? '',
    slug: profile.slug ?? '',
    bio: Object.fromEntries(
      locales.map((locale) => [locale, profile.bio[locale] ?? '']),
    ),
  };
}

export interface AccountProfileViewProps {
  profile: AccountProfile;
  /** The languages the site publishes — the only ones a bio is asked for in. */
  locales: string[];
}

interface ProfileFormProps extends AccountProfileViewProps {
  onChangeEmail: () => void;
  onChangePassword: () => void;
}

/**
 * The signed-in person's own profile (docs/adr/0071): the name and picture
 * the editor shows, and what their author page on the site says about
 * them. Their role is shown, not edited — a role is an admin's to give —
 * and how they sign in (email, password) is changed from here in dialogs
 * of their own, not by this form's Save (docs/adr/0098).
 *
 * The dialogs sit beside the form, never inside it: React sends a submit
 * up through a portal to the form that rendered it, and a password would
 * save the profile.
 */
export function AccountProfileView(props: AccountProfileViewProps) {
  const { changePassword, requestEmailChange } = useAccountCredentials();
  const [dialog, setDialog] = useState<'email' | 'password' | null>(null);
  return (
    <>
      <ProfileForm
        {...props}
        onChangeEmail={() => setDialog('email')}
        onChangePassword={() => setDialog('password')}
      />
      <ChangeEmailDialog
        open={dialog === 'email'}
        onOpenChange={(open) => setDialog(open ? 'email' : null)}
        currentEmail={props.profile.email}
        onRequestEmailChange={requestEmailChange}
      />
      <ChangePasswordDialog
        open={dialog === 'password'}
        onOpenChange={(open) => setDialog(open ? 'password' : null)}
        onChangePassword={changePassword}
      />
    </>
  );
}

function ProfileForm({
  profile,
  locales,
  onChangeEmail,
  onChangePassword,
}: ProfileFormProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    updateProfile,
    isSaving,
    uploadAvatar,
    removeAvatar,
    isChangingAvatar,
  } = useAccountProfile();

  // What the server has, and what is typed: the bar that saves shows only
  // while they differ, and Cancel puts the first back.
  const [saved, setSaved] = useState(() => draftOf(profile, locales));
  const [displayName, setDisplayName] = useState(saved.displayName);
  const [slug, setSlug] = useState(saved.slug);
  const [bio, setBio] = useState(saved.bio);
  const [error, setError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const isDirty =
    JSON.stringify({ displayName, slug, bio }) !== JSON.stringify(saved);

  function cancel() {
    setDisplayName(saved.displayName);
    setSlug(saved.slug);
    setBio(saved.bio);
    setError('');
    setSlugError('');
  }

  const shownName = displayName.trim() || profile.email;
  // What the address will be: the one typed; with the field emptied, the
  // one they have (an empty field keeps it); and for someone who has none
  // yet, the one the server will make from their name.
  const previewSlug = slugify(slug) || profile.slug || slugify(displayName);
  const isSavedAddress = previewSlug !== '' && previewSlug === saved.slug;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSlugError('');
    // Written the way an address is, as leaving the field would have — a
    // press of Enter straight after typing does not leave it.
    const typed = slugify(slug);
    if (slug.trim() && !isCanonicalSlug(typed)) {
      setSlugError(t('account.slugInvalid'));
      return;
    }
    setSlug(typed);
    try {
      const updated = await updateProfile({
        displayName,
        slug: typed || null,
        // The languages the site does not publish are kept as they were:
        // switching a language off must not erase what was written in it.
        bio: { ...profile.bio, ...bio },
      });
      // What the server kept — the name trimmed, the address as it made it —
      // is the saved state now, and nothing is left to save.
      const kept = draftOf(updated, locales);
      setSaved(kept);
      setDisplayName(kept.displayName);
      setSlug(kept.slug);
      setBio(kept.bio);
      toast(t('saveBar.saved'), 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSlugError(t('account.slugTaken'));
      } else if (err instanceof ApiError && err.status === 400) {
        setError(t('account.invalid'));
      } else {
        setError(t('account.saveFailed'));
      }
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setAvatarError('');
    try {
      await uploadAvatar(file);
      toast(t('account.pictureSaved'), 'success');
    } catch (err) {
      setAvatarError(
        err instanceof ApiError && err.status === 413
          ? t('account.pictureTooLarge')
          : err instanceof ApiError && err.status === 400
            ? t('account.pictureNotImage')
            : t('account.pictureFailed'),
      );
    } finally {
      // The same file chosen again is a change too.
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleRemove() {
    setAvatarError('');
    try {
      await removeAvatar();
      toast(t('account.pictureRemoved'), 'success');
    } catch {
      setAvatarError(t('account.pictureFailed'));
    }
  }

  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      <PageHeader title={t('account.title')} description={t('account.intro')} />

      <section
        aria-labelledby={`${ids}-picture`}
        className="flex flex-wrap items-center gap-4"
      >
        <UserAvatar
          seed={profile.id}
          name={shownName}
          imageUrl={profile.avatarUrl}
          size="lg"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id={`${ids}-picture`} className="text-sm font-medium">
            {t('account.picture')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isChangingAvatar}
              onClick={() => fileInput.current?.click()}
            >
              {profile.avatarUrl
                ? t('account.changePicture')
                : t('account.uploadPicture')}
            </Button>
            {profile.avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isChangingAvatar}
                onClick={() => void handleRemove()}
              >
                {t('account.removePicture')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('account.pictureHint')}
          </p>
          {/* The one thing on this screen that does not wait for Save. */}
          <p className="text-xs font-medium">{t('account.pictureSavesNow')}</p>
          {avatarError && <InlineError>{avatarError}</InlineError>}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-name`}>{t('account.displayName')}</Label>
        <Input
          id={`${ids}-name`}
          value={displayName}
          maxLength={120}
          autoComplete="name"
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t('account.displayNameHint')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${ids}-slug`}>{t('account.slug')}</Label>
        <Input
          id={`${ids}-slug`}
          value={slug}
          placeholder={slugify(displayName)}
          maxLength={200}
          spellCheck={false}
          aria-invalid={slugError ? true : undefined}
          aria-describedby={`${ids}-slug-hint`}
          onChange={(event) => setSlug(event.target.value)}
          // Written the way an address is, as soon as they leave the field.
          onBlur={() =>
            setSlug((value) => (value.trim() ? slugify(value) : ''))
          }
        />
        <div id={`${ids}-slug-hint`} className="flex flex-col gap-1">
          {slugError && <InlineError>{slugError}</InlineError>}
          <p className="text-xs text-muted-foreground">
            {t('account.slugHint')}
          </p>
          {previewSlug && (
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {locales.map((locale) => {
                const address = `${PUBLIC_SITE_URL}/${locale}/${authorPathSegment(locale)}/${previewSlug}`;
                return (
                  <li key={locale} className="break-all font-mono">
                    {/* A link once it is the address the site has: one that
                        is only typed leads nowhere yet. It may still say
                        "not found" until there is a published article (the
                        note below says when). `py-1` makes it 24px tall,
                        the least WCAG 2.2 asks of a target — two addresses
                        stacked at line height were too close for axe. */}
                    {isSavedAddress ? (
                      <a
                        href={address}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block py-1 text-foreground underline underline-offset-2 hover:text-primary"
                      >
                        {address}
                        <span className="sr-only">
                          {t('account.opensInNewTab')}
                        </span>
                      </a>
                    ) : (
                      address
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-sm font-medium">{t('account.bio')}</legend>
        <p className="text-xs text-muted-foreground">{t('account.bioHint')}</p>
        {locales.map((locale) => {
          const value = bio[locale] ?? '';
          return (
            <div key={locale} className="flex flex-col gap-2">
              <Label htmlFor={`${ids}-bio-${locale}`}>
                {getLocaleDisplayName(locale, i18n.language)}
              </Label>
              <Textarea
                id={`${ids}-bio-${locale}`}
                lang={locale}
                value={value}
                maxLength={BIO_MAX_CHARS}
                rows={3}
                aria-describedby={`${ids}-bio-${locale}-count`}
                onChange={(event) =>
                  setBio((current) => ({
                    ...current,
                    [locale]: event.target.value,
                  }))
                }
              />
              <p
                id={`${ids}-bio-${locale}-count`}
                className="text-end text-xs text-muted-foreground"
              >
                {t('account.bioCount', {
                  count: value.length,
                  max: BIO_MAX_CHARS,
                })}
              </p>
            </div>
          );
        })}
      </fieldset>

      <SignInSection
        email={profile.email}
        onChangeEmail={onChangeEmail}
        onChangePassword={onChangePassword}
      />

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('account.role')}</dt>
        <dd>{t(`users.role.${profile.role}`)}</dd>
      </dl>

      <p className="text-xs text-muted-foreground">
        {t('account.authorPageNote')}
      </p>

      {error && <InlineError>{error}</InlineError>}
      {/* Not while a picture is on its way: the two land on the same
          person, and the save should not race the upload. */}
      <SaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        canSave={!isChangingAvatar}
        onCancel={cancel}
      />
    </form>
  );
}
