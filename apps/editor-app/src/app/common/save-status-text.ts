import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { SaveStatus } from './save-status';
import { actionErrorMessage } from '../../lib/http-client';
import { useFormatDate } from '../../lib/use-format-date';

/**
 * A key of the app's own dictionary. `ParseKeys` is the same union `t()`
 * itself accepts (see i18n.ts's module augmentation), so a caller naming a
 * string that is not a real key is caught here rather than rendering the
 * key at somebody.
 */
type TranslationKey = ParseKeys;

export interface SaveStatusTextKeys {
  /** What publishing THIS thing means — the one line that genuinely differs between a page, the header and a reusable section. */
  publishedKey: TranslationKey;
  /**
   * Overrides the wording of a landed save. The page editor uses it to say
   * "unpublished changes" instead of "draft saved" once the page IS
   * published: at that point the save has put the draft ahead of what
   * visitors see, which is a different fact and the one that costs
   * somebody something.
   */
  savedKey?: TranslationKey;
}

/**
 * What the canvas top bar says about the draft it is showing.
 *
 * The same switch used to be written three times, once per canvas-backed
 * editor, each with its own copy of "Draft saved". They already agreed on
 * every word but one, so they now share one function and differ only where
 * they really differ.
 *
 * `idle` is the empty string on purpose: before the first change there is
 * nothing true to say, and "Saved" would be a claim about a save that never
 * happened.
 */
export function useSaveStatusText(
  status: SaveStatus,
  { publishedKey, savedKey }: SaveStatusTextKeys,
): string {
  const { t } = useTranslation();
  const formatTime = useFormatDate('time');
  switch (status.kind) {
    case 'idle':
      return '';
    case 'saving':
      return t('canvas.status.saving');
    case 'saved':
      // The time, not the word "saved" on its own: that word stayed on the
      // bar unchanged for the rest of the session, so it answered "has this
      // ever been saved" when the question is "is what I just typed in".
      return t(savedKey ?? 'canvas.status.draftSavedAt', {
        time: formatTime(status.at) ?? '',
      });
    case 'published':
      return t(publishedKey);
    case 'error':
      // The server's own sentence when it gave one, never the exception
      // printed as it came ("ApiError: API 500: {...}").
      return actionErrorMessage(status.error, t('canvas.status.saveFailed'));
  }
}
