import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { actionErrorMessage } from '../../lib/http-client';

export interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  /** What the field holds each time the dialog opens. */
  initialValue?: string;
  submitLabel: string;
  /** The submit button's words while an `onSubmit` that waits runs. */
  busyLabel?: string;
  /** False where an empty answer means something: no link at all. */
  required?: boolean;
  type?: 'text' | 'url';
  /**
   * Gets the answer, trimmed. The dialog closes when it resolves (what it
   * resolves to is not its business); when it throws, the dialog stays
   * open with the answer still in the field and the reason under it.
   */
  onSubmit: (value: string) => Promise<unknown> | void;
  /** The reason, in words. Defaults to the server's own sentence. */
  errorMessage?: (error: unknown) => string;
}

/**
 * One question with a typed answer — a name, an address. What
 * `window.prompt` did, in the editor's own dialog: its language, its
 * theme, and a refusal shown where the answer can be fixed instead of in
 * an alert that threw the answer away.
 */
export function PromptDialog({
  open,
  onOpenChange,
  ...form
}: PromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Inside the content, which only exists while the dialog is
            open: every opening starts from `initialValue` and no error. */}
        <PromptForm {...form} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type PromptFormProps = Omit<PromptDialogProps, 'open' | 'onOpenChange'> & {
  onClose: () => void;
};

function PromptForm({
  title,
  label,
  initialValue = '',
  submitLabel,
  busyLabel,
  required = true,
  type = 'text',
  onSubmit,
  errorMessage,
  onClose,
}: PromptFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [value, setValue] = useState(initialValue);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (caught) {
      setError(
        errorMessage
          ? errorMessage(caught)
          : actionErrorMessage(caught, t('common.error')),
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-value`}>{label}</Label>
          <Input
            id={`${id}-value`}
            type={type}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
        <InlineError id={`${id}-error`}>{error}</InlineError>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={isBusy || (required && value.trim().length === 0)}
          >
            {isBusy ? (busyLabel ?? submitLabel) : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
