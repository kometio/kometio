import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AccountSession } from '@kometio/api-contracts';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { actionErrorMessage } from '../../lib/http-client';
import { useFormatDate } from '../../lib/use-format-date';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { useToast } from '../shell/toast-provider';
import { useAccountSessions } from './use-account-sessions';

/**
 * A use is noted to within a few minutes (docs/adr/0129), so a device used
 * more recently than this is "active now": a time shown to the minute would
 * claim a precision the server does not keep.
 */
const ACTIVE_NOW_MS = 5 * 60 * 1000;

/**
 * Where the person is signed in: each browser or device by the label that
 * says what it is, when it was last used, and a button to sign it out. A
 * password that is known elsewhere, a laptop left in an office and a phone that
 * is gone are all this list's reason (docs/adr/0129).
 *
 * Nothing in it is an address or a way in: the server keeps a label and two
 * dates, and the list shows exactly that. The device the person is looking from
 * has no button: signing out of it is the account menu's.
 */
export function SessionsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const headingId = useId();
  const formatDate = useFormatDate('dateTime');
  const {
    sessions,
    readAt,
    isLoading,
    hasFailed,
    endSession,
    endOtherSessions,
  } = useAccountSessions();
  const [error, setError] = useState('');
  const [confirmingOthers, setConfirmingOthers] = useState(false);

  const nameOf = (session: AccountSession) =>
    session.deviceLabel ?? t('account.sessions.unknownDevice');

  async function signOut(session: AccountSession) {
    setError('');
    try {
      await endSession(session.id);
      toast(
        t('account.sessions.signedOut', { device: nameOf(session) }),
        'success',
      );
    } catch (err) {
      setError(actionErrorMessage(err, t('account.sessions.failed')));
    }
  }

  async function signOutOthers() {
    setError('');
    try {
      await endOtherSessions();
      toast(t('account.sessions.othersSignedOut'), 'success');
    } catch (err) {
      setError(actionErrorMessage(err, t('account.sessions.failed')));
    }
  }

  function activity(session: AccountSession): string {
    if (readAt - new Date(session.lastUsedAt).getTime() < ACTIVE_NOW_MS) {
      return t('account.sessions.activeNow');
    }
    return t('account.sessions.lastUsed', {
      when: formatDate(session.lastUsedAt) ?? '',
    });
  }

  const others = sessions?.filter((session) => !session.isCurrent) ?? [];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-sm font-medium">
          {t('account.sessions.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t('account.sessions.description')}
        </p>
      </div>
      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      {hasFailed && (
        <InlineError>{t('account.sessions.loadFailed')}</InlineError>
      )}
      {sessions && (
        <ul className="divide-y rounded-md border">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span className="truncate">{nameOf(session)}</span>
                  {session.isCurrent && (
                    <Badge variant="secondary">
                      {t('account.sessions.thisDevice')}
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activity(session)}
                  {' · '}
                  {t('account.sessions.signedInOn', {
                    when: formatDate(session.createdAt) ?? '',
                  })}
                </p>
              </div>
              {!session.isCurrent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t('account.sessions.signOutOf', {
                    device: nameOf(session),
                  })}
                  onClick={() => void signOut(session)}
                >
                  {t('account.sessions.signOut')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <InlineError>{error}</InlineError>}
      {others.length > 1 && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmingOthers(true)}
          >
            {t('account.sessions.signOutOthers')}
          </Button>
        </div>
      )}
      {confirmingOthers && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setConfirmingOthers(false)}
          title={t('account.sessions.confirm.title')}
          description={t('account.sessions.confirm.description')}
          actionLabel={t('account.sessions.signOutOthers')}
          onConfirm={() => {
            setConfirmingOthers(false);
            void signOutOthers();
          }}
        />
      )}
    </section>
  );
}
