import { useMutation } from '@tanstack/react-query';
import type { SeoMeta } from '@kometio/shared-types';
import { updatePageTranslationSeoMeta } from '../../lib/page-groups-api-client';
import { useUpdateTranslationsCache } from './use-page-group-editor';

export function usePageTranslationSeo(groupId: string, translationId: string) {
  const updateTranslationsCache = useUpdateTranslationsCache(groupId);

  const updateSeoMetaMutation = useMutation({
    mutationFn: (seoMeta: SeoMeta) =>
      updatePageTranslationSeoMeta(translationId, seoMeta),
    onSuccess: (updated) => updateTranslationsCache(updated),
  });

  return {
    updateSeoMeta: updateSeoMetaMutation.mutateAsync,
    isSaving: updateSeoMetaMutation.isPending,
  };
}
