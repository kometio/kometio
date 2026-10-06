import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from '../../lib/use-translation';
import { OptionsSelect } from '../../components/ui/select';
import { useIsNarrow } from '../common/use-is-narrow';
import { NavLink } from '../shell/nav-link';
import { SETTINGS_GROUPS } from './settings-sections';
import { useVisibleSettingsSections } from './use-visible-settings-sections';

/**
 * The menu of the settings area: every section by name, in groups, each an
 * address of its own — the same look as the sidebar's entries, because it
 * is the same kind of thing one level down.
 *
 * On a phone the column is not there to hold it, so it becomes a select at
 * the top that goes to the section chosen.
 */
export function SettingsNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();
  const sections = useVisibleSettingsSections();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // A section owns its sub-pages too: the legal-documents wizard is still
  // "Cookies & privacy".
  const current = sections.find(
    (section) =>
      pathname === section.to || pathname.startsWith(`${section.to}/`),
  );

  if (isNarrow) {
    return (
      <OptionsSelect
        aria-label={t('settings.nav.select')}
        className="w-full"
        value={current?.to ?? ''}
        onValueChange={(to) => void navigate({ to })}
        groups={SETTINGS_GROUPS.map((group) => ({
          label: t(`settings.nav.groups.${group}`),
          options: sections
            .filter((section) => section.group === group)
            .map((section) => ({
              value: section.to,
              label: t(`settings.nav.items.${section.id}`),
            })),
        })).filter((group) => group.options.length > 0)}
      />
    );
  }

  return (
    <nav
      aria-label={t('settings.nav.label')}
      className="flex flex-col gap-4 self-start"
    >
      {SETTINGS_GROUPS.map((group) => {
        const inGroup = sections.filter((section) => section.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-1">
            <h2 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t(`settings.nav.groups.${group}`)}
            </h2>
            <ul className="contents">
              {inGroup.map((section) => (
                <li key={section.id} className="contents">
                  <NavLink to={section.to} icon={section.icon}>
                    {t(`settings.nav.items.${section.id}`)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
