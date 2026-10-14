import { useRef } from 'react';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../shell/toast-provider';

export interface InvitationLinkDialogProps {
  /** Who the invitation is for. */
  email: string;
  /** The link, as the server gave it: it is on this screen and nowhere else. */
  link: string;
  onClose: () => void;
}

/**
 * The invitation of a server with no mail server (docs/adr/0103): nothing was
 * sent, so the link is given to the administrator who made it, to pass on.
 *
 * It is shown here once. The server does not keep it where it could be read
 * again — not in its log, not in the list of users — so closing this is the
 * end of it, and the way to a new one is "Resend invite".
 */
export function InvitationLinkDialog({
  email,
  link,
  onClose,
}: InvitationLinkDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const field = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('users.inviteLinkDialog.copied'), 'success');
    } catch {
      // No clipboard where the page is not on a secure origin, or the
      // browser said no: leave the link selected, ready for the keys.
      field.current?.select();
      toast(t('users.inviteLinkDialog.copyFailed'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('users.inviteLinkDialog.title', { email })}
          </DialogTitle>
          <DialogDescription>
            {t('users.inviteLinkDialog.description', { email })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invitation-link">
              {t('users.inviteLinkDialog.linkLabel')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="invitation-link"
                ref={field}
                readOnly
                value={link}
                aria-describedby="invitation-link-hint"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => void copy()}
              >
                <Copy />
                {t('users.inviteLinkDialog.copy')}
              </Button>
            </div>
            <p
              id="invitation-link-hint"
              className="text-xs text-muted-foreground"
            >
              {t('users.inviteLinkDialog.onlyOnce')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('users.inviteLinkDialog.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
