import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type { Block } from '@kometio/shared-types';
import {
  publishSiteLayoutSection,
  saveDraft,
  updateSticky,
  type SiteLayoutSectionKind,
} from '../../lib/site-layout-sections-api-client';
import { siteLayoutSectionQueryOptions } from './site-layout-sections-queries';
import { useDraftEditor } from '../common/use-draft-editor';
import { useToast } from '../shell/toast-provider';

// No debounce here — same reasoning as usePageGroupEditor:
// canvas-editor-shell.tsx already debounces property/text changes on its
// own. The draft/publish lifecycle itself lives in useDraftEditor.
export function useSiteLayoutSectionEditor(
  siteId: string,
  locale: string,
  kind: SiteLayoutSectionKind,
) {
  const queryOptions = siteLayoutSectionQueryOptions(siteId, locale, kind);
  const { data: section } = useSuspenseQuery(queryOptions);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();

  const draft = useDraftEditor({
    queryKey: queryOptions.queryKey,
    save: useCallback(
      (content: Block[]) => saveDraft(section.id, content),
      [section.id],
    ),
    publish: useCallback(
      () => publishSiteLayoutSection(section.id),
      [section.id],
    ),
  });
  const { setStatus } = draft;

  // Not part of the draft on purpose (docs/adr/0018 follow-up): sticky
  // takes effect immediately, it isn't "content" the canvas debounces
  // alongside its own property/text changes.
  const stickyMutation = useMutation({
    mutationFn: (sticky: boolean) => updateSticky(section.id, sticky),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryOptions.queryKey, updated);
      // The switch flips by itself, but the change is live on the site at
      // once, without a publish: that is worth saying.
      toast(
        t(
          updated.sticky ? 'layout.editor.stickyOn' : 'layout.editor.stickyOff',
        ),
        'success',
      );
    },
    onError: (error: unknown) => setStatus({ kind: 'error', error }),
  });

  const handleStickyChange = useCallback(
    (sticky: boolean) => stickyMutation.mutate(sticky),
    [stickyMutation],
  );

  return {
    section,
    status: draft.status,
    isSaving: draft.isSaving,
    handleChange: draft.handleChange,
    handlePublish: draft.handlePublish,
    whenSaved: draft.whenSaved,
    handleStickyChange,
  };
}
