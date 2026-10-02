import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, GitFork } from 'lucide-react';
import { getLocaleDisplayName } from '@kometio/shared-types';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover';
import { Button } from '../../components/ui/button';
import { ListItemButton } from '../../components/ui/list-item-button';

export interface LanguageSwitcherTranslation {
  locale: string;
  isDiverged: boolean;
}

export interface LanguageSwitcherProps {
  translations: LanguageSwitcherTranslation[];
  value: string;
  onChange: (locale: string) => void;
}

/**
 * i18n a livello di campo (see the plan) — controlled local state, same
 * "no navigation, no persistence" pattern as BreakpointSelector: this
 * switches which PageTranslation overlay is in view/edit within the SAME
 * mounted PageGroupEditorView, it doesn't remount the editor the way
 * PageSwitcher's page-to-page navigation does. Resets to whatever locale
 * the caller opened with on every fresh mount, same as breakpoint.
 */
export function LanguageSwitcher({
  translations,
  value,
  onChange,
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = translations.find((tr) => tr.locale === value);

  function handleSelect(locale: string): void {
    setOpen(false);
    if (locale !== value) {
      onChange(locale);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs">
          <span className="font-medium uppercase">{value}</span>
          {active?.isDiverged && (
            <GitFork size={12} aria-label={t('canvas.language.diverged')} />
          )}
          <ChevronDown size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-1"
        aria-label={t('canvas.language.switch')}
      >
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          {t('canvas.language.switch')}
        </p>
        <div className="max-h-72 overflow-y-auto">
          {translations.map((translation) => (
            <ListItemButton
              key={translation.locale}
              onClick={() => handleSelect(translation.locale)}
              aria-current={translation.locale === value ? 'true' : undefined}
              className="justify-between"
            >
              <span className="truncate">
                <span className="uppercase">{translation.locale}</span>{' '}
                <span className="text-muted-foreground">
                  {getLocaleDisplayName(translation.locale, i18n.language)}
                </span>
              </span>
              {translation.isDiverged && (
                <GitFork
                  size={12}
                  className="shrink-0 text-muted-foreground"
                  aria-label={t('canvas.language.diverged')}
                />
              )}
            </ListItemButton>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
