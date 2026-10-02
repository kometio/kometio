import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { PanelBottom, PanelTop } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { PageHeader } from '../shell/page-header';

export interface LayoutViewProps {
  enabledLocales: string[];
  locale: string;
}

/**
 * Entry point for Header/Footer (docs/adr/0018) — a locale switcher (only
 * shown once the site actually has more than one locale, same threshold
 * LocaleListEditor implies) plus one row for each, that opens the
 * fullscreen editor. No "create" step: getOrCreateSiteLayoutSection means
 * the editor is always ready the moment you land on it.
 *
 * Named after what it holds — the header and the footer — because
 * "Layout" said nothing to anybody who is not a developer, and the site's
 * look (colours, fonts) is the separate Style section (style-view.tsx,
 * docs/adr/0021). Two rows in a list, not two cards: the action is a
 * written button on each, so it is the same shape as every other list.
 */
export function LayoutView({ enabledLocales, locale }: LayoutViewProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('layout.title')} />
      {enabledLocales.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('layout.localeLabel')}
          </span>
          {enabledLocales.map((loc) => (
            <Link
              key={loc}
              to="/layout"
              search={{ locale: loc }}
              className={cn('inline-flex', loc === locale && 'font-semibold')}
            >
              <Badge variant={loc === locale ? 'default' : 'outline'}>
                {loc.toUpperCase()}
              </Badge>
            </Link>
          ))}
          {/* Why the choice matters: switching language here changes which
              header and footer the rows below open. */}
          <span className="text-xs text-muted-foreground">
            {t('layout.localeNote')}
          </span>
        </div>
      )}
      <ul className="flex max-w-2xl flex-col divide-y rounded-lg border">
        <li className="flex items-center gap-3 p-4">
          <PanelTop className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">
              {t('layout.headerTitle')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('layout.editHeaderDescription')}
            </span>
          </div>
          <Button asChild variant="outline" size="sm">
            {/* Read as "Edit Header", said as "Edit" on the button: the
                name carries what it edits, and contains the words on
                screen. */}
            <Link
              to="/layout/header"
              search={{ locale }}
              aria-label={t('layout.editHeader')}
            >
              {t('layout.editAction')}
            </Link>
          </Button>
        </li>
        <li className="flex items-center gap-3 p-4">
          <PanelBottom className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">
              {t('layout.footerTitle')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('layout.editFooterDescription')}
            </span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link
              to="/layout/footer"
              search={{ locale }}
              aria-label={t('layout.editFooter')}
            >
              {t('layout.editAction')}
            </Link>
          </Button>
        </li>
      </ul>
    </div>
  );
}
