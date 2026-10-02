import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  isInterfaceLanguage,
  USER_ROLES,
  type InterfaceLanguage,
} from '@kometio/shared-types';
import { OptionsSelect } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import type {
  InviteUserInput,
  UserRecord,
  UserRole,
} from '../../lib/users-api-client';
import { InlineError } from '../../components/ui/inline-error';
import { UI_LANGUAGES } from '../account/interface-languages';
import { RoleDescriptions } from './role-descriptions';

export interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (input: InviteUserInput) => Promise<UserRecord>;
}

export function InviteUserDialog({
  open,
  onOpenChange,
  onInvite,
}: InviteUserDialogProps) {
  const { t, i18n } = useTranslation();
  // Offered the inviter's own language to begin with: the one they read the
  // editor in is the likeliest for somebody they are inviting to it. Chosen
  // by them, not guessed for the invitee, so it is always a choice made.
  const ownLanguage = isInterfaceLanguage(i18n.language) ? i18n.language : 'en';
  const [language, setLanguage] = useState<InterfaceLanguage | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('editor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fresh form on every close, whatever caused it — same reasoning as
  // NewPageDialog's own handleOpenChange.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEmail('');
      setDisplayName('');
      setRole('editor');
      setLanguage(null);
      setError('');
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onInvite({
        email,
        displayName,
        role,
        language: language ?? ownLanguage,
      });
      handleOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t('users.inviteDialog.emailTaken')
          : actionErrorMessage(err, t('users.inviteDialog.failed')),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.inviteDialog.title')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">
              {t('users.inviteDialog.emailLabel')}
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-display-name">
              {t('users.inviteDialog.displayNameLabel')}
            </Label>
            <Input
              id="invite-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">
              {t('users.inviteDialog.roleLabel')}
            </Label>
            <OptionsSelect
              id="invite-role"
              value={role}
              onValueChange={(value) => {
                const next = USER_ROLES.find(
                  (candidate) => candidate === value,
                );
                if (next) setRole(next);
              }}
              options={USER_ROLES.map((candidate) => ({
                value: candidate,
                label: t(`users.role.${candidate}`),
              }))}
            />
            {/* What the choice means, with the one being made set apart. */}
            <RoleDescriptions highlighted={role} className="pt-1" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-language">
              {t('users.inviteDialog.languageLabel')}
            </Label>
            <OptionsSelect
              id="invite-language"
              aria-describedby="invite-language-hint"
              value={language ?? ownLanguage}
              onValueChange={(value) => {
                if (isInterfaceLanguage(value)) setLanguage(value);
              }}
              options={UI_LANGUAGES}
            />
            <p
              id="invite-language-hint"
              className="text-xs text-muted-foreground"
            >
              {t('users.inviteDialog.languageHint')}
            </p>
          </div>
          {error && <InlineError>{error}</InlineError>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t('users.inviteDialog.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t('users.inviteDialog.inviting')
                : t('users.inviteDialog.invite')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
