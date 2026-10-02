import { useTranslation } from 'react-i18next';
import type { PageGroupListItemRecord } from '@kometio/api-contracts';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { groupDisplayTitle } from './page-group-display';
import { subpagesMovingUp } from './page-deletion';

/** How many titles the question names before it says "and N more". */
const NAMED_TITLES = 3;

/** Up to three titles, then "+ N": the dialog names pages, it does not list them all. */
function namedTitles(titles: readonly string[], quoted = false): string {
  const name = (title: string) => (quoted ? `“${title}”` : title);
  return titles.length > NAMED_TITLES
    ? `${titles.slice(0, NAMED_TITLES).map(name).join(', ')} + ${titles.length - NAMED_TITLES}`
    : titles.map(name).join(', ');
}

export interface DeletePagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pages ticked, at least one. */
  selected: readonly PageGroupListItemRecord[];
  /** Every page in the list, to find what hangs under the ones ticked. */
  all: readonly PageGroupListItemRecord[];
  defaultLocale: string;
  onConfirm: () => void;
}

/**
 * The question before pages are deleted, in the words of what would happen
 * to these pages in particular.
 *
 * A page with subpages can be deleted: they move to the top level, and their
 * addresses change — the current ones lead nowhere, since they began with the
 * deleted page's. The dialog names them, so nobody is surprised afterwards.
 * What is asked about is the pages ticked, and the subpages that are ticked
 * too do not count: they go first.
 */
export function DeletePagesDialog({
  open,
  onOpenChange,
  selected,
  all,
  defaultLocale,
  onConfirm,
}: DeletePagesDialogProps) {
  const { t } = useTranslation();
  const moving = subpagesMovingUp(selected, all);
  // Named when every one of them is on screen, counted when some are not:
  // half a list of names would read as the whole.
  const movingUpSentence = (up: ReturnType<typeof subpagesMovingUp>) =>
    up.named.length === up.count
      ? t('pages.deleteDialog.subpagesMoveUpNamed', {
          count: up.count,
          children: namedTitles(
            up.named.map((group) => groupDisplayTitle(group, defaultLocale)),
          ),
        })
      : t('pages.deleteDialog.subpagesMoveUp', { count: up.count });

  const titles = selected.map((group) =>
    groupDisplayTitle(group, defaultLocale),
  );
  const [only] = selected;
  const otherLocales =
    selected.length === 1 && only
      ? only.translations
          .map((translation) => translation.locale)
          .filter((locale) => locale !== defaultLocale)
      : [];
  const hasDefaultLanguage =
    only?.translations.some(
      (translation) => translation.locale === defaultLocale,
    ) ?? false;

  const description =
    selected.length > 1
      ? t('pages.deleteDialog.descriptionMany', {
          names: namedTitles(titles, true),
        })
      : otherLocales.length > 0 && hasDefaultLanguage
        ? t('pages.deleteDialog.descriptionWithTranslations', {
            name: titles[0] ?? '',
            locales: otherLocales
              .map((locale) => locale.toUpperCase())
              .join(', '),
          })
        : t('pages.deleteDialog.description', { name: titles[0] ?? '' });

  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('pages.deleteDialog.title', { count: selected.length })}
      description={
        moving.count > 0
          ? `${description} ${movingUpSentence(moving)}`
          : description
      }
      onConfirm={onConfirm}
    />
  );
}
