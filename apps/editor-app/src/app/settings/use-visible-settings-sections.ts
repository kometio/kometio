import { useCurrentSession } from '../auth/use-current-session';
import { useServerFeatures } from '../common/deployment-queries';
import {
  SETTINGS_SECTIONS,
  isOfferedBy,
  type SettingsSection,
} from './settings-sections';

/**
 * The sections of the settings area that this person is offered, in the menu's
 * order: those their role may open, on a server that can do what the section
 * needs. Read by the menu and by the search, so a section is never in one and
 * missing from the other.
 */
export function useVisibleSettingsSections(): SettingsSection[] {
  const { can } = useCurrentSession();
  const server = useServerFeatures();
  return SETTINGS_SECTIONS.filter(
    (section) => can(section.permission) && isOfferedBy(section, server),
  );
}
