import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  CONSENT_CATEGORIES,
  type ConsentCategory,
  type TrackerScriptEntry,
  type TrackerScriptPlacement,
  trackerScriptPlacementSchema,
} from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { OptionsSelect } from '../../components/ui/select';

export interface TrackerScriptListEditorProps {
  entries: TrackerScriptEntry[];
  onChange: (entries: TrackerScriptEntry[]) => void;
}

// Same cap as TrackerDomainListEditor (site-theme-settings.ts) — mirrored
// here from cookie-consent.ts's MAX_TRACKER_SCRIPTS.
const MAX_ENTRIES = 20;

/**
 * Cookie consent (docs/adr/0039): each entry here is one third-party
 * snippet, tagged with the consent category that gates it at render time
 * (apps/public-site/src/lib/consent-script-blocking.ts) — the structured
 * alternative to the free-text head/body script fields above, which have
 * no per-snippet boundary and can't be gated at all. Entries are usually
 * added automatically (a known vendor pasted above gets detected and moved
 * here on save, see update-site-theme-settings.use-case.ts's
 * tracker-signature-detector), but can also be added or recategorized by
 * hand for a vendor the detector doesn't recognize.
 */
/** The category a select answered, if it is one — read from the list itself, so nothing is asserted. */
function asConsentCategory(value: string): ConsentCategory | undefined {
  return CONSENT_CATEGORIES.find((category) => category === value);
}

export function TrackerScriptListEditor({
  entries,
  onChange,
}: TrackerScriptListEditorProps) {
  const { t } = useTranslation();
  const categoryOptions = CONSENT_CATEGORIES.map((category) => ({
    value: category,
    label: t(`cookieConsent.category.${category}`),
  }));
  const nameId = useId();
  const categoryId = useId();
  const placementId = useId();
  const htmlId = useId();
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] =
    useState<ConsentCategory>('measurement');
  const [newPlacement, setNewPlacement] =
    useState<TrackerScriptPlacement>('head');
  const [newHtml, setNewHtml] = useState('');
  // The entry whose code is open for editing, one at a time.
  const [editingId, setEditingId] = useState<string | null>(null);

  function addEntry() {
    const label = newLabel.trim();
    const html = newHtml.trim();
    if (!label || !html) return;

    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        label,
        category: newCategory,
        placement: newPlacement,
        html,
      },
    ]);
    setNewLabel('');
    setNewHtml('');
  }

  function removeEntry(id: string) {
    onChange(entries.filter((entry) => entry.id !== id));
  }

  function updateEntry(id: string, changes: Partial<TrackerScriptEntry>) {
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    );
  }

  const atCap = entries.length >= MAX_ENTRIES;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => {
          const isEditing = editingId === entry.id;
          const codeId = `${htmlId}-${entry.id}`;
          return (
            <li
              key={entry.id}
              className="flex flex-col gap-2 rounded-md border px-3 py-2"
            >
              {/* Stacked on a phone, where a name, a category select and
                  two buttons side by side left the name two letters. */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {entry.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`integrations.placement.${entry.placement}`)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <OptionsSelect
                    aria-label={t('integrations.trackerScriptCategoryFor', {
                      name: entry.label,
                    })}
                    className="w-40"
                    value={entry.category}
                    onValueChange={(value) => {
                      const category = asConsentCategory(value);
                      if (category) updateEntry(entry.id, { category });
                    }}
                    options={categoryOptions}
                  />
                  {/* Written, both: an added script used to be a row with
                      a category and a picture of a bin, and the code that
                      was pasted in could not be seen again, let alone
                      corrected. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={isEditing}
                    aria-controls={isEditing ? codeId : undefined}
                    aria-label={t('integrations.editScriptNamed', {
                      name: entry.label,
                    })}
                    onClick={() => setEditingId(isEditing ? null : entry.id)}
                  >
                    <Pencil />
                    {t('integrations.editScript')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('integrations.removeTrackerScriptNamed', {
                      name: entry.label,
                    })}
                    onClick={() => removeEntry(entry.id)}
                  >
                    <Trash2 />
                    {t('integrations.removeTrackerScript')}
                  </Button>
                </div>
              </div>
              {isEditing && (
                <Textarea
                  id={codeId}
                  aria-label={t('integrations.scriptCodeFor', {
                    name: entry.label,
                  })}
                  value={entry.html}
                  onChange={(event) =>
                    updateEntry(entry.id, { html: event.target.value })
                  }
                  rows={4}
                  className="font-mono text-xs"
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-3 rounded-md border p-3">
        {/* A name above each field, not only inside it: a placeholder is
            gone the moment something is typed. Stacked on a phone, where
            side by side the name shrank to two letters. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={nameId} className="text-xs">
              {t('integrations.trackerScriptName')}
            </Label>
            <Input
              id={nameId}
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder={t('integrations.trackerScriptLabelPlaceholder')}
              disabled={atCap}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-40">
            <Label htmlFor={categoryId} className="text-xs">
              {t('integrations.trackerScriptCategory')}
            </Label>
            <OptionsSelect
              id={categoryId}
              className="w-full"
              value={newCategory}
              onValueChange={(value) => {
                const category = asConsentCategory(value);
                if (category) setNewCategory(category);
              }}
              options={categoryOptions}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:w-28">
            <Label htmlFor={placementId} className="text-xs">
              {t('integrations.trackerScriptPlacement')}
            </Label>
            <OptionsSelect
              id={placementId}
              className="w-full"
              value={newPlacement}
              onValueChange={(value) => {
                const placement = trackerScriptPlacementSchema.options.find(
                  (candidate) => candidate === value,
                );
                if (placement) setNewPlacement(placement);
              }}
              options={trackerScriptPlacementSchema.options.map(
                (placement) => ({
                  value: placement,
                  label: t(`integrations.placement.${placement}`),
                }),
              )}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={htmlId} className="text-xs">
            {t('integrations.trackerScriptHtml')}
          </Label>
          <Textarea
            id={htmlId}
            value={newHtml}
            onChange={(event) => setNewHtml(event.target.value)}
            placeholder={t('integrations.trackerScriptHtmlPlaceholder')}
            rows={2}
            className="font-mono text-xs"
            disabled={atCap}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={addEntry}
          disabled={atCap || !newLabel.trim() || !newHtml.trim()}
        >
          <Plus className="size-3.5" />
          {t('integrations.addTrackerScript')}
        </Button>
      </div>
    </div>
  );
}
