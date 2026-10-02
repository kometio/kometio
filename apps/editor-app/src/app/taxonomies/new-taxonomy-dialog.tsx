import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from '../../lib/use-translation';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
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
import { ApiError, actionErrorMessage } from '../../lib/http-client';

/** What the dialog asks for, before the site's language has named it. */
export interface NewTaxonomyInput {
  name: string;
  /** Absent = derive one from the name, `null` = mount the terms at the site root. */
  prefix?: string | null;
  hierarchical: boolean;
}

export interface NewTaxonomyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: NewTaxonomyInput) => Promise<unknown>;
}

/**
 * Making a category: its name, where its terms live in the site's
 * addresses, and whether a term can sit inside another.
 *
 * A dialog opened from the screen's header, not a form above the list: it
 * is asked once in a while, and above the list it stood between the title
 * and everything the screen is for.
 */
export function NewTaxonomyDialog({
  open,
  onOpenChange,
  onCreate,
}: NewTaxonomyDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Inside the content, which only exists while the dialog is open:
            every opening starts from nothing typed and no error. */}
        <NewTaxonomyForm
          onCreate={onCreate}
          onClose={() => onOpenChange(false)}
        />
        <span className="sr-only">{t('taxonomies.new')}</span>
      </DialogContent>
    </Dialog>
  );
}

function NewTaxonomyForm({
  onCreate,
  onClose,
}: {
  onCreate: NewTaxonomyDialogProps['onCreate'];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [rootMounted, setRootMounted] = useState(false);
  // On by default, as it always was: a tree of terms costs nothing to
  // ignore, and a flat list cannot be made into one by accident.
  const [hierarchical, setHierarchical] = useState(true);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsBusy(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        // Three states on purpose (ADR-0064): a prefix, deliberately none,
        // or "derive one from the name" — which is the key being absent,
        // not an empty string.
        ...(rootMounted
          ? { prefix: null }
          : prefix.trim()
            ? { prefix: prefix.trim() }
            : {}),
        hierarchical,
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? t('taxonomies.prefixTaken')
          : actionErrorMessage(caught, t('taxonomies.createFailed')),
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t('taxonomies.new')}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>{t('taxonomies.nameLabel')}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-prefix`}>{t('taxonomies.prefixLabel')}</Label>
        <Input
          id={`${id}-prefix`}
          value={prefix}
          disabled={rootMounted}
          placeholder={t('taxonomies.prefixPlaceholder')}
          onChange={(event) => setPrefix(event.target.value)}
        />
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id={`${id}-root`}
            checked={rootMounted}
            onCheckedChange={(checked) => setRootMounted(checked === true)}
          />
          <Label htmlFor={`${id}-root`} className="font-normal">
            {t('taxonomies.rootMounted')}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('taxonomies.prefixHint')}
        </p>
      </div>
      <div className="flex items-start gap-2 text-sm">
        <Checkbox
          id={`${id}-hierarchical`}
          className="mt-0.5"
          checked={hierarchical}
          onCheckedChange={(checked) => setHierarchical(checked === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={`${id}-hierarchical`} className="font-normal">
            {t('taxonomies.hierarchical')}
          </Label>
          <span className="text-xs text-muted-foreground">
            {t('taxonomies.hierarchicalHint')}
          </span>
        </div>
      </div>
      <InlineError>{error}</InlineError>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isBusy || !name.trim()}>
          {isBusy ? t('taxonomies.creating') : t('taxonomies.createSubmit')}
        </Button>
      </DialogFooter>
    </form>
  );
}
