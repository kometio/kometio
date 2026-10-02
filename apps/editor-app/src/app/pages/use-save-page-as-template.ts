import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { savePageGroupAsTemplate } from '../../lib/page-groups-api-client';
import { reusableSectionsQueryKey } from '../sections/reusable-sections-queries';
import { useToast } from '../shell/toast-provider';

/**
 * The page's last save did not reach the server: a template made now
 * would copy the page as it was before that edit.
 */
class PageNotSavedError extends Error {}

/** Turning the page on screen into a template (docs/adr/0072). */
export function useSavePageAsTemplate({
  groupId,
  siteId,
  whenSaved,
  hasFailedSave,
}: {
  groupId: string;
  siteId: string;
  /** Resolves when the queued draft saves have landed. */
  whenSaved: () => Promise<void>;
  /** Whether the last save that settled failed. */
  hasFailedSave: () => boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /**
   * "Save as template" (docs/adr/0072). The name is asked in a
   * PromptDialog, as "turn into a reusable section" asks it: a name is the
   * only thing this needs. It starts from the page's title in the site's
   * default language, which is the language the template will hold.
   *
   * The canvas has already sent any change still in its debounce by the
   * time the dialog opens (see CanvasEditorShell's page menu); waiting for
   * that save to land, and refusing when it did not, is what makes the
   * template the page as it is on screen. A refusal is said in the dialog,
   * with the name still typed.
   */
  async function saveAsTemplate(name: string) {
    await whenSaved();
    // A save that failed has settled too, and the server would copy the
    // page as it was before that edit while the toast said "saved".
    if (hasFailedSave()) {
      throw new PageNotSavedError();
    }
    const template = await savePageGroupAsTemplate(groupId, name);
    await queryClient.invalidateQueries({
      queryKey: reusableSectionsQueryKey(siteId),
    });
    toast(t('pages.saveAsTemplate.saved', { name: template.name }), 'success');
  }

  function templateErrorMessage(caught: unknown): string {
    if (caught instanceof PageNotSavedError) {
      return t('pages.saveAsTemplate.unsaved');
    }
    if (caught instanceof ApiError && caught.status === 409) {
      return t('sections.nameTaken');
    }
    return actionErrorMessage(caught, t('pages.saveAsTemplate.failed'));
  }

  return { saveAsTemplate, templateErrorMessage };
}
