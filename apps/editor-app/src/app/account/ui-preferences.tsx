import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '../../components/ui/choice-group';
import { Label } from '../../components/ui/label';
import { OptionsSelect } from '../../components/ui/select';
import type { Theme } from '../../theme';
import { useTheme } from '../style/use-theme';
import { UI_LANGUAGES } from './interface-languages';
import { useInterfaceLanguage } from './use-interface-language';

export const THEME_CHOICES: readonly {
  value: Theme;
  icon: LucideIcon;
  labelKey:
    | 'shell.account.themeLight'
    | 'shell.account.themeDark'
    | 'shell.account.themeSystem';
}[] = [
  { value: 'light', icon: Sun, labelKey: 'shell.account.themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'shell.account.themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'shell.account.themeSystem' },
];

/**
 * How the editor looks and speaks to THIS person: their language and their
 * theme. They live with the account, not with the site's settings — they
 * follow the person to every site they open, and an editor, who may change
 * no setting of the site, still owns them.
 */
export function UiPreferences() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { language, choose } = useInterfaceLanguage();

  return (
    <div className="flex flex-col gap-3 px-2 py-1.5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ui-language" className="text-xs text-muted-foreground">
          {t('shell.account.language')}
        </Label>
        <OptionsSelect
          id="ui-language"
          size="sm"
          className="w-full"
          aria-describedby="ui-language-hint"
          value={language}
          onValueChange={choose}
          options={UI_LANGUAGES}
        />
        <p id="ui-language-hint" className="text-xs text-muted-foreground">
          {t('shell.account.languageHint')}
        </p>
      </div>
      {/* Three choices, not a switch: "follow the system" is the default
          and a two-position toggle cannot say it. A machine that is light
          used to get a black editor and no way to ask for the same as
          everything else. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {t('shell.account.theme')}
        </span>
        <ChoiceGroup
          label={t('shell.account.theme')}
          value={theme}
          onValueChange={setTheme}
          choices={THEME_CHOICES.map(({ value, icon: Icon, labelKey }) => ({
            value,
            label: t(labelKey),
            icon: <Icon className="size-3.5" />,
          }))}
        />
      </div>
    </div>
  );
}
