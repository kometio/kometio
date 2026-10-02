import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { actionErrorMessage } from '../../lib/http-client';
import type { CollectionRecord } from '../../lib/collections-api-client';
import { PageTemplateSelect } from '../pages/page-template-select';
import type { PublishedTemplate } from '../sections/reusable-sections-queries';
import { CollectionIconSelect } from './collection-icon-select';

export interface CollectionRowProps {
  collection: CollectionRecord;
  /** The published templates the site has: with none, the row asks nothing about them. */
  templates: PublishedTemplate[];
  /** Puts a change of name and icon to the server, and answers with what it kept. */
  onSave: (
    changes: Partial<Pick<CollectionRecord, 'name' | 'icon'>>,
  ) => Promise<CollectionRecord>;
  onTemplateChange: (defaultTemplateId: string | null) => void;
  onDelete: () => void;
}

/**
 * One collection: its name and icon, which are saved together with a Save
 * of the row's own (they used to save on leaving the field, so tabbing
 * past a name changed it and nothing said so), and the template new pages
 * start from, which is a choice and takes effect when made.
 */
export function CollectionRow({
  collection,
  templates,
  onSave,
  onTemplateChange,
  onDelete,
}: CollectionRowProps) {
  const { t } = useTranslation();
  const ids = useId();
  const [name, setName] = useState(collection.name);
  const [icon, setIcon] = useState(collection.icon);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = name.trim() !== collection.name || icon !== collection.icon;

  function cancel() {
    setName(collection.name);
    setIcon(collection.icon);
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('collections.nameRequired'));
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      const kept = await onSave({
        ...(name.trim() !== collection.name && { name: name.trim() }),
        ...(icon !== collection.icon && { icon }),
      });
      // What the server kept is what the row shows, and it is saved.
      setName(kept.name);
      setIcon(kept.icon);
    } catch (err) {
      setError(actionErrorMessage(err, t('collections.actionFailed')));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${ids}-name`}>{t('collections.dialog.name')}</Label>
          <Input
            id={`${ids}-name`}
            value={name}
            aria-invalid={error && !name.trim() ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-48">
          <Label htmlFor={`${ids}-icon`}>
            {t('collections.dialog.iconLabel')}
          </Label>
          <CollectionIconSelect
            id={`${ids}-icon`}
            value={icon}
            onChange={setIcon}
          />
        </div>
        {isDirty && (
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? t('collections.saving') : t('collections.save')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSaving}
              onClick={cancel}
            >
              {t('collections.cancel')}
            </Button>
          </div>
        )}
      </form>
      <InlineError>{error}</InlineError>
      {/* Only once the site has a template: a choice between "blank" and
          nothing is not a choice (docs/adr/0072). Stacked on a phone,
          where side by side the label left the select half the row and
          cut a template's name mid-word. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {templates.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <Label
              htmlFor={`collection-template-${collection.id}`}
              className="shrink-0 text-xs font-normal text-muted-foreground"
            >
              {t('collections.dialog.defaultTemplate')}
            </Label>
            <PageTemplateSelect
              id={`collection-template-${collection.id}`}
              templates={templates}
              value={collection.defaultTemplateId}
              onChange={onTemplateChange}
              size="sm"
              className="w-full min-w-0 sm:w-auto sm:flex-1"
            />
          </div>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('collections.dialog.delete', {
            name: collection.name,
          })}
          onClick={onDelete}
        >
          <Trash2 />
          {t('collections.deleteShort')}
        </Button>
      </div>
    </li>
  );
}
