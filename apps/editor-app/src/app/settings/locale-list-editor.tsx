import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  CURATED_LOCALE_CODES,
  getLocaleDisplayName,
} from '@kometio/shared-types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { ListItemButton } from '../../components/ui/list-item-button';
import { Input } from '../../components/ui/input';

export interface LocaleListEditorProps {
  enabledLocales: string[];
  defaultLocale: string;
  onChange: (enabledLocales: string[], defaultLocale: string) => void;
}

/**
 * A site's `enabledLocales`/`defaultLocale` (docs/adr/0017): picked from
 * CURATED_LOCALE_CODES, a curated BCP-47 list — not exhaustive, and not
 * enforced by localeSettingsSchema itself (still accepts any 2+ character
 * string, see that schema's own comment), so a site with an existing
 * non-curated code keeps working unchanged; it just won't show up
 * pre-selected in this picker. Same "input + client-side filter" pattern
 * as IconPickerDialog (docs/adr/0023), not a full Combobox/cmdk dependency
 * — this project has deliberately avoided that so far.
 */
export function LocaleListEditor({
  enabledLocales,
  defaultLocale,
  onChange,
}: LocaleListEditorProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const availableCodes = useMemo(
    () =>
      CURATED_LOCALE_CODES.filter(
        (code) => !enabledLocales.includes(code.toLowerCase()),
      ),
    [enabledLocales],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableCodes;
    // What was typed most likely starts the code (`fr` → fr-FR) or the
    // name, so those come first: filtering on "contains" alone put
    // "English (South Africa)" ahead of French for `fr`, and Enter takes
    // the first. Within a rank the curated order is kept.
    const rank = (code: string): number => {
      if (code.toLowerCase().startsWith(q)) return 0;
      const name = getLocaleDisplayName(code, i18n.language).toLowerCase();
      if (name.startsWith(q)) return 1;
      if (code.toLowerCase().includes(q) || name.includes(q)) return 2;
      return 3;
    };
    return availableCodes
      .map((code) => ({ code, rank: rank(code) }))
      .filter((entry) => entry.rank < 3)
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.code);
  }, [availableCodes, search, i18n.language]);

  function addLocale(code: string) {
    onChange([...enabledLocales, code.toLowerCase()], defaultLocale);
    setSearch('');
    setOpen(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const [first] = filtered;
    if (event.key === 'Enter' && first !== undefined) {
      event.preventDefault();
      addLocale(first);
    }
  }

  // The default language cannot be removed: which language the site falls
  // back on is not something to settle by taking it away. Choose another
  // as the default first, and this one can go.
  function removeLocale(code: string) {
    if (code === defaultLocale) return;
    onChange(
      enabledLocales.filter((locale) => locale !== code),
      defaultLocale,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {enabledLocales.map((code) => {
          const language = getLocaleDisplayName(code, i18n.language);
          const isDefault = code === defaultLocale;
          return (
            <li
              key={code}
              className="flex flex-col gap-1 rounded-md border px-3 py-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-medium uppercase">{code}</span>
                  <span className="text-xs text-muted-foreground">
                    {language}
                  </span>
                  {isDefault ? (
                    <Badge variant="secondary">
                      {t('localeSettings.defaultBadge')}
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('localeSettings.setDefaultNamed', {
                        language,
                      })}
                      onClick={() => onChange(enabledLocales, code)}
                    >
                      {t('localeSettings.setDefault')}
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('localeSettings.removeNamed', { language })}
                  onClick={() => removeLocale(code)}
                  disabled={isDefault}
                >
                  <Trash2 />
                  {t('localeSettings.remove')}
                </Button>
              </div>
              {/* Why it cannot be taken away, where the button is: a
                  disabled button that says nothing is a locked door. */}
              {isDefault && (
                <p className="text-xs text-muted-foreground">
                  {enabledLocales.length > 1
                    ? t('localeSettings.defaultCannotBeRemoved')
                    : t('localeSettings.lastCannotBeRemoved')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
          >
            <Plus className="size-3.5" />
            {t('localeSettings.addLocale')}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="p-2"
          aria-label={t('localeSettings.addLocale')}
        >
          <Input
            type="search"
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('localeSettings.newLocalePlaceholder')}
            aria-label={t('localeSettings.newLocalePlaceholder')}
          />
          {filtered.length === 0 ? (
            <p className="px-1 py-4 text-center text-sm text-muted-foreground">
              {t('localeSettings.noMatches')}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.map((code) => (
                <li key={code}>
                  <ListItemButton
                    onClick={() => addLocale(code)}
                    className="justify-between"
                  >
                    <span>{getLocaleDisplayName(code, i18n.language)}</span>
                    <span className="text-xs text-muted-foreground uppercase">
                      {code}
                    </span>
                  </ListItemButton>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
