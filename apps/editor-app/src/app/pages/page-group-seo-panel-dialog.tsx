import type { SeoMeta } from '@kometio/shared-types';
import { useTranslation } from 'react-i18next';
import { SeoMetaDialog } from '../common/seo-meta-dialog';
import { usePageTranslationSeo } from './use-page-translation-seo';

export interface PageGroupSeoPanelDialogProps {
  groupId: string;
  translationId: string;
  seoMeta: SeoMeta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * i18n a livello di campo (see the plan) — scoped to ONE PageTranslation's
 * own per-locale seoMeta.
 *
 * The fields themselves live in `SeoMetaDialog`, shared with a term's
 * route (docs/adr/0067): what is page-specific is the endpoint this saves
 * through, and that is all this component is now.
 */
export function PageGroupSeoPanelDialog({
  groupId,
  translationId,
  seoMeta,
  open,
  onOpenChange,
}: PageGroupSeoPanelDialogProps) {
  const { t } = useTranslation();
  const { updateSeoMeta, isSaving } = usePageTranslationSeo(
    groupId,
    translationId,
  );

  return (
    <SeoMetaDialog
      heading={t('pages.seo.title')}
      seoMeta={seoMeta}
      open={open}
      onOpenChange={onOpenChange}
      onSave={async (next) => {
        await updateSeoMeta(next);
      }}
      isSaving={isSaving}
    />
  );
}
