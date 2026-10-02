import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SiteRecord } from '@kometio/api-contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { InlineError } from '../../components/ui/inline-error';
import { useTranslation } from '../../lib/use-translation';
import { actionErrorMessage } from '../../lib/http-client';
import { updateThemePackage as sendThemePackage } from '../../lib/sites-api-client';
import { availableThemesQueryOptions } from '../settings/site-queries';
import { SettingsSectionHeader } from '../settings/settings-section';
import { useSiteUpdate } from '../settings/use-site-update';
import { useToast } from '../shell/toast-provider';
import { ThemeUploadPanel } from './theme-upload-panel';

export interface ThemeSectionProps {
  site: SiteRecord;
}

/**
 * Which theme the site is on: the ones this deployment has, and uploading
 * another.
 *
 * Applied the moment it is chosen — a theme is not a setting among the
 * others below it but the thing they are settings of, and it has its own
 * endpoint — so it says so, and says when it has been done, instead of
 * waiting for the bar that saves the rest.
 */
export function ThemeSection({ site }: ThemeSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: availableThemes = [] } = useQuery(
    availableThemesQueryOptions(),
  );
  const { save, isSaving } = useSiteUpdate(site.id, sendThemePackage);
  const [error, setError] = useState('');

  async function change(themeName: string) {
    setError('');
    try {
      await save({ themeName });
      toast(t('globalStyles.themeChanged', { name: themeName }), 'success');
    } catch (err) {
      setError(actionErrorMessage(err, t('globalStyles.themeChangeFailed')));
    }
  }

  return (
    <section
      aria-labelledby="style-theme-title"
      className="flex flex-col gap-3"
    >
      <SettingsSectionHeader
        id="style-theme-title"
        title={t('globalStyles.themeTitle')}
        description={t('globalStyles.themeHint')}
      />
      <Select
        value={site.themeName}
        onValueChange={(value) => void change(value)}
        disabled={isSaving}
      >
        <SelectTrigger
          id="style-theme"
          // Named by the heading above: axe found this select with no name
          // at all.
          aria-labelledby="style-theme-title"
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableThemes.map((theme) => (
            <SelectItem key={theme.name} value={theme.name}>
              {theme.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isSaving && (
        <p className="text-xs text-muted-foreground">
          {t('globalStyles.themeSaving')}
        </p>
      )}
      <InlineError>{error}</InlineError>
      <ThemeUploadPanel onUse={(themeName) => void change(themeName)} />
    </section>
  );
}
