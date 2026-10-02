import { useTranslation } from 'react-i18next';
import { USER_ROLES } from '@kometio/shared-types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { OptionsSelect } from '../../components/ui/select';
import type { UserRecord, UserRole } from '../../lib/users-api-client';
import { UI_LANGUAGES } from '../account/interface-languages';
import { UserAvatar } from '../account/user-avatar';

export interface UserRowProps {
  user: UserRecord;
  /** This row is the person looking at the screen. */
  isYou: boolean;
  onRoleChange: (role: UserRole) => void;
  onToggleActive: () => void;
  onResendInvite: () => void;
  onCancelInvite: () => void;
}

/**
 * One person of the list: who they are, their role, whether they can get
 * in, and what can be done about it.
 *
 * Name and email are one block that shortens (`min-w-0`, `truncate`) and
 * never runs under the controls; on a phone the controls go under the
 * block, level with the name and not with the avatar.
 */
export function UserRow({
  user,
  isYou,
  onRoleChange,
  onToggleActive,
  onResendInvite,
  onCancelInvite,
}: UserRowProps) {
  const { t } = useTranslation();
  const name = user.displayName || user.email;
  const isPending = user.invitePending;
  // In its own tongue, like the selector it comes from. Nobody chose yet:
  // the site's language writes to them, which is said rather than guessed.
  const language = UI_LANGUAGES.find(
    (candidate) => candidate.value === user.language,
  );

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar seed={user.id} name={name} imageUrl={user.avatarUrl} />
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            {isYou && (
              <Badge variant="secondary" className="shrink-0">
                {t('users.list.you')}
              </Badge>
            )}
          </span>
          {user.displayName && (
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          )}
          <span className="truncate text-xs text-muted-foreground">
            {language
              ? t('users.list.language', { name: language.label })
              : t('users.list.languageOfTheSite')}
          </span>
          {/* The reason is on the row, not in a tooltip that a phone
              never shows. Refused server-side too. */}
          {isYou && (
            <span className="text-xs text-muted-foreground">
              {t('users.list.yourRowNote')}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
        <OptionsSelect
          aria-label={t('users.list.roleLabel', { name })}
          className="w-auto"
          value={user.role}
          disabled={isYou}
          onValueChange={(value) => {
            const role = USER_ROLES.find((candidate) => candidate === value);
            if (role) onRoleChange(role);
          }}
          options={USER_ROLES.map((role) => ({
            value: role,
            label: t(`users.role.${role}`),
          }))}
        />
        {/* States have their own colours: a person who can get in is
            green, one who is waiting to is amber, one who cannot is a
            plain outline. */}
        <Badge
          variant={
            isPending ? 'warning' : user.isActive ? 'success' : 'outline'
          }
        >
          {isPending
            ? t('users.list.statusPending')
            : user.isActive
              ? t('users.list.statusActive')
              : t('users.list.statusInactive')}
        </Badge>
        {isPending ? (
          // An invitation is not a deactivation: there is nobody to
          // "reactivate" yet, only a link to send again or to withdraw.
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResendInvite}
            >
              {t('users.list.resendInvite')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelInvite}
            >
              {t('users.list.cancelInvite')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isYou}
            onClick={onToggleActive}
          >
            {user.isActive
              ? t('users.list.deactivate')
              : t('users.list.reactivate')}
          </Button>
        )}
      </div>
    </li>
  );
}
