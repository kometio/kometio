import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  trackerDomainSchema,
  type TrackerDomainEntry,
} from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { InlineError } from '../../components/ui/inline-error';

export interface TrackerDomainListEditorProps {
  entries: TrackerDomainEntry[];
  onChange: (entries: TrackerDomainEntry[]) => void;
}

// ADR-0031's CSP tracker whitelist — a bare hostname per entry (no scheme,
// no path, matches trackerDomainSchema), applied automatically to
// script-src/connect-src/frame-src for this site (see
// content-security-policy.ts) rather than asking the admin to pick
// directives one by one: whoever can reach this page already has
// unrestricted script execution via the head/body script fields above, so
// per-directive granularity wouldn't lower risk, just add form complexity.
export function TrackerDomainListEditor({
  entries,
  onChange,
}: TrackerDomainListEditorProps) {
  const { t } = useTranslation();
  const [newLabel, setNewLabel] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState('');
  const errorId = useId();
  const nameId = useId();
  const hostId = useId();

  function addEntry() {
    const label = newLabel.trim();
    const domain = newDomain.trim().toLowerCase();
    if (!label || !domain) return;

    const result = trackerDomainSchema.safeParse(domain);
    if (!result.success) {
      setError(t('integrations.invalidDomain'));
      return;
    }

    setError('');
    onChange([...entries, { label, domain: result.data }]);
    setNewLabel('');
    setNewDomain('');
  }

  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  const atCap = entries.length >= 20;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {entries.map((entry, index) => (
          <li
            // Only ever appended/removed here, never reordered — same
            // reasoning as opening-hours-editor.tsx's own index keys.
            key={index}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {entry.label}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {entry.domain}
              </span>
            </div>
            {/* Written, and named for the row: "Remove domain" on every
                row of a list said nothing about which. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={t('integrations.removeDomainNamed', {
                name: entry.label,
              })}
              onClick={() => removeEntry(index)}
            >
              <Trash2 />
              {t('integrations.removeDomain')}
            </Button>
          </li>
        ))}
      </ul>
      {/* A name above each field, not only inside it: a placeholder
          is gone the moment something is typed, and the second field
          would then be an unnamed box. In a column on a phone, where
          the name shrank to two letters. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label htmlFor={nameId} className="text-xs">
            {t('integrations.domainName')}
          </Label>
          <Input
            id={nameId}
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder={t('integrations.domainLabelPlaceholder')}
            disabled={atCap}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={hostId} className="text-xs">
            {t('integrations.domainHost')}
          </Label>
          <Input
            id={hostId}
            value={newDomain}
            onChange={(event) => {
              setNewDomain(event.target.value);
              setError('');
            }}
            placeholder={t('integrations.domainPlaceholder')}
            disabled={atCap}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start sm:self-auto"
          onClick={addEntry}
          disabled={atCap || !newLabel.trim() || !newDomain.trim()}
        >
          <Plus className="size-3.5" />
          {t('integrations.addDomain')}
        </Button>
      </div>
      <InlineError id={errorId}>{error}</InlineError>
    </div>
  );
}
