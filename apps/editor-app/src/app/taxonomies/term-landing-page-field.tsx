import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../lib/use-translation';
import { Button } from '../../components/ui/button';
import { PagePickerDialog } from '../pages/page-picker-dialog';
import { pageGroupTranslationsQueryOptions } from '../pages/page-groups-queries';

export interface TermLandingPageFieldProps {
  siteId: string;
  locale: string;
  landingPageGroupId: string | null;
  onChange: (landingPageGroupId: string | null) => void;
}

/**
 * Which page, if any, is rendered at this term's own address.
 *
 * The term's URL works either way (docs/adr/0064): with no page it serves
 * the default layout — the term's name, its description, and the pages
 * filed under it — and with one it serves that page's blocks IN PLACE,
 * never a redirect. Saying that here, next to the button, is the point:
 * "landing page" reads like a required field otherwise, and the whole
 * design is that it is not one.
 *
 * The name shown is the page's own, fetched by id: after a reload the
 * term carries only the id, and offering to "change" something identified
 * by a UUID is not an offer anybody can act on.
 */
export function TermLandingPageField({
  siteId,
  locale,
  landingPageGroupId,
  onChange,
}: TermLandingPageFieldProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: translations } = useQuery({
    ...pageGroupTranslationsQueryOptions(landingPageGroupId ?? ''),
    enabled: landingPageGroupId !== null,
  });

  const translation = translations?.find((one) => one.locale === locale);
  const chosenName = translation?.seoMeta.title || translation?.slug || null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        {t('taxonomies.landingPage')}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          {landingPageGroupId
            ? (chosenName ?? t('taxonomies.landingPageChosen'))
            : t('taxonomies.landingPageDefault')}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
        >
          {landingPageGroupId
            ? t('taxonomies.landingPageChange')
            : t('taxonomies.landingPageChoose')}
        </Button>
        {landingPageGroupId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            {t('taxonomies.landingPageClear')}
          </Button>
        )}
      </div>
      <PagePickerDialog
        siteId={siteId}
        locale={locale}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(page) => {
          onChange(page.pageGroupId);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
