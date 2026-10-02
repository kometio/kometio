import type { FieldValues, Path, UseFormProps } from 'react-hook-form';
import type { SiteRecord } from '@kometio/api-contracts';
import { useSavedForm, type SaveConfirmation } from './use-saved-form';
import { useSiteUpdate } from './use-site-update';

export interface SiteSettingsFormOptions<Values extends FieldValues, Change> {
  /** The site as the route loaded it: the form starts from it. */
  site: SiteRecord;
  /** The form's own options: a resolver, if it has one. */
  form?: Omit<UseFormProps<Values>, 'defaultValues' | 'values'>;
  /** What a failed save says when the server gave nothing better: what was not saved, in words. See `useSavedForm`. */
  failedMessage: string;
  /** What the form shows of a site — of the loaded one, and of the one a save answers with. */
  toFormValues: (site: SiteRecord) => Values;
  /** What the API is sent, from what the form holds once it is valid. */
  toChange: (values: Values) => Change;
  send: (siteId: string, change: Change) => Promise<SiteRecord>;
  /**
   * The API's name for a field the form calls something else: a 400 that
   * says `businessPhone` is wrong is put under the form's `phone`. Names
   * that are the same in both need nothing here.
   */
  fieldAliases?: Partial<Record<string, Path<Values>>>;
  /** See `useSavedForm`: a question before a save that turns something off or takes something away. */
  confirmBeforeSave?: (
    values: Values,
    savedValues: Values,
  ) => SaveConfirmation | null | Promise<SaveConfirmation | null>;
}

/**
 * A section of the site's settings as a form: `useSavedForm`, with the
 * site as the record and the site update as the save. Its `section` goes
 * straight into `SettingsSection`.
 *
 * Five dialogs did this by hand, about a hundred lines each, and had
 * already started to differ in how they spaced an error.
 */
export function useSiteSettingsForm<Values extends FieldValues, Change>({
  site,
  form,
  failedMessage,
  toFormValues,
  toChange,
  send,
  fieldAliases,
  confirmBeforeSave,
}: SiteSettingsFormOptions<Values, Change>) {
  const { save, isSaving } = useSiteUpdate(site.id, send);
  return useSavedForm({
    saved: site,
    form,
    failedMessage,
    toFormValues,
    save: (values) => save(toChange(values)),
    isSaving,
    fieldAliases,
    confirmBeforeSave,
  });
}
