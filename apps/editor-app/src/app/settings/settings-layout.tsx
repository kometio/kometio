import { Outlet } from '@tanstack/react-router';
import { useTranslation } from '../../lib/use-translation';
import { PageHeader } from '../shell/page-header';
import { SettingsNav } from './settings-nav';

/**
 * The frame of the settings area: what the site is set up as, in one
 * place with its own menu — not a popover of dialogs at the foot of the
 * sidebar, which held six of them and was the only route to any.
 *
 * The content is one width for every section: the sections used to be as
 * wide as whichever screen they came from (`max-w-lg`, `-xl`, `-2xl`), and
 * the menu beside them moved sideways with each click.
 */
export function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
      />
      {/* One column that may not grow past the screen: a grid's automatic
          column is as wide as its widest unbreakable line, so a long email
          in the users' list made every section 616px wide on a phone. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
        <SettingsNav />
        <div className="flex max-w-2xl min-w-0 flex-col gap-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
