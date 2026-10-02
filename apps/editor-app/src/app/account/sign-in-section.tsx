import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

export interface SignInSectionProps {
  /** The address they sign in with now. */
  email: string;
  onChangeEmail: () => void;
  onChangePassword: () => void;
}

/**
 * How the person signs in: the address, and the password, each with the
 * button that changes it. Neither waits for the profile's Save: both ask
 * for the current password in a dialog of their own and act at once — the
 * email by mailing a link, so the sentence says which.
 */
export function SignInSection({
  email,
  onChangeEmail,
  onChangePassword,
}: SignInSectionProps) {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-sm font-medium">
        {t('account.signIn.title')}
      </h2>
      <div className="flex flex-col gap-3">
        {/* One `dl` per row, holding only its term and definition: a button
            inside a `dl`, or a `div` around a `div`, is not a list of terms
            (axe: definition-list, dlitem). */}
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <dl className="min-w-0 text-sm">
            <dt className="text-muted-foreground">{t('account.email')}</dt>
            <dd className="break-all">{email}</dd>
          </dl>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChangeEmail}
          >
            {t('account.signIn.changeEmail')}
          </Button>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <dl className="min-w-0 text-sm">
            <dt className="text-muted-foreground">
              {t('account.signIn.password')}
            </dt>
            <dd>{t('account.signIn.passwordHint')}</dd>
          </dl>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onChangePassword}
          >
            {t('account.signIn.changePassword')}
          </Button>
        </div>
      </div>
    </section>
  );
}
