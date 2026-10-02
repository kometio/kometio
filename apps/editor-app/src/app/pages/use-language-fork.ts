import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { relinkedOverlay } from '@kometio/shared-types';
import { actionErrorMessage } from '../../lib/http-client';
import { useToast } from '../shell/toast-provider';
import { translatableFieldsOf } from '../common/translatable-fields';
import type { BlockDescriptor } from '@kometio/block-registry';
import type {
  PageGroupRecord,
  PageTranslationRecord,
} from '../../lib/page-groups-api-client';

/**
 * Unlinking a language from the shared structure and putting it back
 * (docs/adr/0075): the two confirmations, what relinking would drop, and
 * the waits that keep either from running ahead of a save.
 */
export function useLanguageFork({
  group,
  activeTranslation,
  activeLocale,
  registry,
  whenSaved,
  hasFailedSave,
  handleDiverge,
  handleRelink,
  onRelinked,
}: {
  group: PageGroupRecord;
  activeTranslation: PageTranslationRecord;
  activeLocale: string;
  registry: BlockDescriptor[];
  whenSaved: () => Promise<void>;
  hasFailedSave: () => boolean;
  handleDiverge: () => Promise<unknown>;
  handleRelink: (
    translatableFields: ReturnType<typeof translatableFieldsOf>,
  ) => Promise<unknown>;
  /** After a language is put back on the structure, so the canvas draws it. */
  onRelinked: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isDivergeConfirmOpen, setIsDivergeConfirmOpen] = useState(false);
  const [isRelinkConfirmOpen, setIsRelinkConfirmOpen] = useState(false);
  const translatableFields = useMemo(
    () => translatableFieldsOf(registry),
    [registry],
  );

  // What relinking would drop, for the dialog to say before it happens.
  // Computed from what is on screen; the relink itself recomputes it from
  // what the server holds once every pending save has landed.
  const blocksLostOnRelink = useMemo(
    () =>
      activeTranslation.divergedContent
        ? relinkedOverlay(
            group.content,
            activeTranslation.divergedContent,
            translatableFields,
          ).lostBlockCount
        : 0,
    [group.content, activeTranslation.divergedContent, translatableFields],
  );

  async function confirmDiverge() {
    setIsDivergeConfirmOpen(false);
    await handleDiverge();
  }

  async function confirmRelink() {
    setIsRelinkConfirmOpen(false);
    try {
      // The same wait as "save as template": relinking from a fork the
      // server never received would carry over text that is not there.
      await whenSaved();
      if (hasFailedSave()) {
        toast(t('canvas.language.relinkUnsaved'), 'destructive');
        return;
      }
      await handleRelink(translatableFields);
      onRelinked();
      toast(
        t('canvas.language.relinked', {
          locale: activeLocale.toUpperCase(),
        }),
        'success',
      );
    } catch (caught) {
      toast(
        actionErrorMessage(caught, t('canvas.language.relinkFailed')),
        'destructive',
      );
    }
  }

  return {
    isDivergeConfirmOpen,
    setIsDivergeConfirmOpen,
    isRelinkConfirmOpen,
    setIsRelinkConfirmOpen,
    blocksLostOnRelink,
    confirmDiverge,
    confirmRelink,
  };
}
