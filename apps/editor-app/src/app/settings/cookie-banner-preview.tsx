import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocaleDisplayName } from '@kometio/shared-types';
import type { CookieBannerSettings } from '@kometio/shared-types';
import { cn } from '../../lib/utils';
import { OptionsSelect } from '../../components/ui/select';
import { TabPanel, Tabs } from '../../components/ui/tabs';

type PreviewStage = 'banner' | 'after';

export interface CookieBannerPreviewProps {
  settings: Pick<
    CookieBannerSettings,
    | 'position'
    | 'acceptButtonSide'
    | 'showReopenTab'
    | 'reopenPosition'
    | 'copyOverrides'
  >;
  /** The languages the site publishes: the banner is drawn in one of them at a time. */
  locales: readonly string[];
  /** The one it opens in, when the site publishes it. */
  defaultLocale: string;
}

/** A stand-in for the page behind the banner: lines of text, so a banner over it reads as one. */
function PageBackdrop() {
  return (
    <div aria-hidden className="flex flex-col gap-2 p-4">
      <div className="h-3 w-1/3 rounded bg-muted-foreground/25" />
      <div className="h-2 w-full rounded bg-muted-foreground/15" />
      <div className="h-2 w-5/6 rounded bg-muted-foreground/15" />
      <div className="h-2 w-2/3 rounded bg-muted-foreground/15" />
    </div>
  );
}

/**
 * The banner as the form describes it now, saved or not: where it sits,
 * which side the Accept button is on, the texts, and — after the visitor
 * has chosen — the tab that brings it back.
 *
 * Drawn by the editor, not by the site in a frame: it answers "what will
 * this position and these words look like?", and says under it that the
 * real thing has the site's own styling. The buttons are not buttons —
 * nothing here can be pressed and nothing on it should be tabbed to.
 */
export function CookieBannerPreview({
  settings,
  locales,
  defaultLocale,
}: CookieBannerPreviewProps) {
  const { t, i18n } = useTranslation();
  const [stage, setStage] = useState<PreviewStage>('banner');
  const [chosen, setChosen] = useState<string | null>(null);
  const locale = [chosen, defaultLocale, locales[0]].find(
    (code) => code !== null && code !== undefined && locales.includes(code),
  );
  const overrides = locale ? settings.copyOverrides[locale] : undefined;

  // What the visitor reads: the site's own text for the language if there
  // is one, else a sample of the built-in wording.
  const copy = {
    title: overrides?.title || t('cookieBanner.preview.title'),
    body: overrides?.body || t('cookieBanner.preview.body'),
    acceptAll: overrides?.acceptAll || t('cookieBanner.preview.acceptAll'),
    rejectAll: overrides?.rejectAll || t('cookieBanner.preview.rejectAll'),
    customize: overrides?.customize || t('cookieBanner.preview.customize'),
  };

  const card = (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
      <p className="text-sm font-semibold">{copy.title}</p>
      <p className="text-xs text-muted-foreground">{copy.body}</p>
      <div
        className={cn(
          'flex flex-wrap items-center gap-2',
          settings.acceptButtonSide === 'right' && 'flex-row-reverse',
        )}
      >
        <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
          {copy.acceptAll}
        </span>
        <span className="rounded-md border px-2.5 py-1 text-xs font-medium">
          {copy.rejectAll}
        </span>
        <span className="text-xs underline">{copy.customize}</span>
      </div>
    </div>
  );

  const positioned =
    settings.position === 'bottom-bar' ? (
      <div className="absolute inset-x-0 bottom-0 p-2">{card}</div>
    ) : settings.position === 'center-modal' ? (
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 p-3">
        <div className="w-64 max-w-full">{card}</div>
      </div>
    ) : (
      <div
        className={cn(
          'absolute bottom-2 w-64 max-w-[calc(100%-1rem)]',
          settings.position === 'bottom-left' ? 'left-2' : 'right-2',
        )}
      >
        {card}
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          id="cookie-preview"
          label={t('cookieBanner.preview.stages')}
          value={stage}
          onChange={setStage}
          tabs={[
            { value: 'banner', label: t('cookieBanner.preview.before') },
            { value: 'after', label: t('cookieBanner.preview.after') },
          ]}
          className="w-fit"
        />
        {locales.length > 1 && locale && (
          <OptionsSelect
            aria-label={t('cookieBanner.preview.language')}
            className="w-40"
            value={locale}
            onValueChange={setChosen}
            options={locales.map((code) => ({
              value: code,
              label: getLocaleDisplayName(code, i18n.language),
            }))}
          />
        )}
      </div>
      <TabPanel tabsId="cookie-preview" value={stage}>
        <div
          role="img"
          aria-label={t('cookieBanner.preview.label')}
          className="relative h-56 overflow-hidden rounded-md border bg-muted/40"
        >
          <PageBackdrop />
          {stage === 'banner' && positioned}
          {stage === 'after' && settings.showReopenTab && (
            <span
              className={cn(
                'absolute bottom-0 rounded-t-md border border-b-0 bg-card px-2.5 py-1 text-xs',
                settings.reopenPosition === 'bottom-left'
                  ? 'left-3'
                  : 'right-3',
              )}
            >
              {t('cookieBanner.preview.reopenTab')}
            </span>
          )}
        </div>
        {stage === 'after' && !settings.showReopenTab && (
          <p className="pt-2 text-xs text-muted-foreground">
            {t('cookieBanner.preview.noTab')}
          </p>
        )}
      </TabPanel>
      <p className="text-xs text-muted-foreground">
        {t('cookieBanner.preview.note')}
      </p>
    </div>
  );
}
