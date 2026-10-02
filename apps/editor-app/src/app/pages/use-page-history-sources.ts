import { useTranslation } from 'react-i18next';
import { type PageTranslationRecord } from '../../lib/page-groups-api-client';
import { usePageGroupVersions } from './use-page-group-versions';
import { usePageTranslationVersions } from './use-page-translation-versions';
import { type VersionSource } from '../common/version-history-dialog';

/**
 * What the version history dialog offers for the language on screen: the
 * shared structure's versions and the language's own, and how a restore
 * waits for the saves already on their way.
 */
export function usePageHistorySources({
  groupId,
  activeTranslation,
  activeLocale,
  defaultLocale,
  isOpen,
  whenSaved,
  onRestored,
}: {
  groupId: string;
  activeTranslation: PageTranslationRecord;
  activeLocale: string;
  defaultLocale: string;
  /** The dialog is open: nothing is fetched before. */
  isOpen: boolean;
  whenSaved: () => Promise<void>;
  /** After a version is put back, so the canvas draws it. */
  onRestored: () => void;
}): VersionSource[] {
  const { t } = useTranslation();
  // An unlinked language no longer follows the shared structure, so that
  // history is not offered there: restoring it would change every other
  // language and leave the one on screen as it was.
  const structureHistory = usePageGroupVersions(
    groupId,
    isOpen && !activeTranslation.isDiverged,
  );
  const languageHistory = usePageTranslationVersions(
    groupId,
    activeTranslation.id,
    isOpen,
  );
  function restoringWith(rollback: (versionId: string) => Promise<unknown>) {
    return async (versionId: string) => {
      // A save still on its way would land after the restore and
      // overwrite it with the page as it was before. A change still in
      // the canvas's debounce has been sent already: the history opens
      // from the page menu, and the shell flushes before any of its items.
      await whenSaved();
      await rollback(versionId);
      onRestored();
    };
  }

  const languageLabel = activeLocale.toUpperCase();
  const languageSource: VersionSource = {
    key: 'language',
    label: t('pages.versionHistory.sources.language', {
      locale: languageLabel,
    }),
    versions: languageHistory.versions.map((version) => ({
      id: version.id,
      createdAt: version.createdAt,
      // Restoring one of these unlinks the language again — the one thing
      // a restore does here that it never did before.
      note: version.divergedContent
        ? t('pages.versionHistory.unlinkedNote')
        : undefined,
    })),
    isLoading: languageHistory.isLoading,
    onRollback: restoringWith(languageHistory.rollback),
  };
  const historySources: VersionSource[] = activeTranslation.isDiverged
    ? [languageSource]
    : [
        {
          key: 'structure',
          label: t('pages.versionHistory.sources.structure'),
          versions: structureHistory.versions,
          isLoading: structureHistory.isLoading,
          onRollback: restoringWith(structureHistory.rollback),
        },
        // The site's own language has its text IN the structure, so its
        // own history is only ever the forks it had — offered once there
        // is one, rather than as an empty tab next to every page.
        ...(activeLocale !== defaultLocale ||
        languageHistory.versions.length > 0
          ? [languageSource]
          : []),
      ];
  return historySources;
}
