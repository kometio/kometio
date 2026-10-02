import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '../../components/ui/button';
import { actionErrorMessage } from '../../lib/http-client';
import type { UserRecord, UserRole } from '../../lib/users-api-client';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { InviteUserDialog } from './invite-user-dialog';
import { useCurrentSession } from '../auth/use-current-session';
import { RoleDescriptions } from './role-descriptions';
import { UserRow } from './user-row';
import { USERS_PAGE_SIZE } from './users-queries';
import { useUsers } from './use-users';
import { SettingsSectionHeader } from '../settings/settings-section';
import { useToast } from '../shell/toast-provider';
import { InlineError } from '../../components/ui/inline-error';
import { Pagination } from '../common/pagination';

export interface UsersListViewProps {
  items: UserRecord[];
  page: number;
  total: number;
  /** Open with the "Invite user" dialog already showing. */
  startInviting?: boolean;
}

export function UsersListView({
  items,
  page,
  total,
  startInviting = false,
}: UsersListViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    inviteUser,
    updateUserRole,
    setUserActive,
    resendInvite,
    cancelInvite,
  } = useUsers();
  const { toast } = useToast();

  const { session } = useCurrentSession();

  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(startInviting);
  const [actionError, setActionError] = useState('');
  // Switching somebody off ends their sessions on the spot. It is one
  // click next to a role dropdown, and it was taking effect on the way
  // down.
  const [pendingDeactivation, setPendingDeactivation] =
    useState<UserRecord | null>(null);
  // Withdrawing an invitation removes the person: asked first, like a
  // deactivation.
  const [pendingCancellation, setPendingCancellation] =
    useState<UserRecord | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));

  async function goToPage(target: number) {
    await navigate({ to: '/settings/users', search: { page: target } });
  }

  async function handleRoleChange(user: UserRecord, role: UserRole) {
    setActionError('');
    try {
      await updateUserRole(user.id, role);
      toast(
        t('users.list.roleChanged', {
          name: user.displayName || user.email,
          role: t(`users.role.${role}`),
        }),
        'success',
      );
    } catch (err) {
      setActionError(actionErrorMessage(err, t('users.list.actionFailed')));
    }
  }

  async function handleActiveToggle(user: UserRecord) {
    if (!user.isActive) {
      await applyActiveChange(user, true);
      return;
    }
    setPendingDeactivation(user);
  }

  async function applyActiveChange(user: UserRecord, isActive: boolean) {
    setActionError('');
    try {
      await setUserActive(user.id, isActive);
      toast(
        t(isActive ? 'users.list.reactivated' : 'users.list.deactivated', {
          name: user.displayName || user.email,
        }),
        'success',
      );
    } catch (err) {
      setActionError(actionErrorMessage(err, t('users.list.actionFailed')));
    }
  }

  async function handleResendInvite(user: UserRecord) {
    setActionError('');
    try {
      await resendInvite(user.id);
      toast(t('users.list.inviteResent', { email: user.email }), 'success');
    } catch (err) {
      setActionError(actionErrorMessage(err, t('users.list.actionFailed')));
    }
  }

  async function handleCancelInvite(user: UserRecord) {
    setActionError('');
    try {
      await cancelInvite(user.id);
      toast(t('users.list.inviteCancelled', { email: user.email }), 'success');
    } catch (err) {
      setActionError(actionErrorMessage(err, t('users.list.actionFailed')));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SettingsSectionHeader
        title={t('users.list.title')}
        description={t('users.list.description')}
        actions={
          <Button onClick={() => setIsInviteDialogOpen(true)}>
            {t('users.list.invite')}
          </Button>
        }
      />
      {actionError && <InlineError>{actionError}</InlineError>}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('users.list.empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isYou={user.id === session?.userId}
              onRoleChange={(role) => void handleRoleChange(user, role)}
              onToggleActive={() => void handleActiveToggle(user)}
              onResendInvite={() => void handleResendInvite(user)}
              onCancelInvite={() => setPendingCancellation(user)}
            />
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(target) => void goToPage(target)}
      />
      <section
        aria-labelledby="roles-heading"
        className="flex flex-col gap-2 rounded-lg border p-4"
      >
        <h3 id="roles-heading" className="text-sm font-semibold">
          {t('users.roles.title')}
        </h3>
        <RoleDescriptions />
      </section>
      <InviteUserDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        onInvite={async (input) => {
          const invited = await inviteUser(input);
          toast(
            t('users.inviteDialog.sent', { email: input.email }),
            'success',
          );
          return invited;
        }}
      />
      {pendingCancellation && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setPendingCancellation(null)}
          title={t('users.list.cancelInviteConfirm.title')}
          description={t('users.list.cancelInviteConfirm.description', {
            email: pendingCancellation.email,
          })}
          actionLabel={t('users.list.cancelInvite')}
          onConfirm={() => {
            const user = pendingCancellation;
            setPendingCancellation(null);
            void handleCancelInvite(user);
          }}
        />
      )}
      {pendingDeactivation && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setPendingDeactivation(null)}
          title={t('users.list.deactivateConfirm.title')}
          description={t('users.list.deactivateConfirm.description', {
            name: pendingDeactivation.displayName || pendingDeactivation.email,
          })}
          actionLabel={t('users.list.deactivate')}
          onConfirm={() => {
            const user = pendingDeactivation;
            setPendingDeactivation(null);
            void applyActiveChange(user, false);
          }}
        />
      )}
    </div>
  );
}
