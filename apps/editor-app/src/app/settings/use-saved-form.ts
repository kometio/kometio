import { useRef, useState, type FormEvent } from 'react';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormProps,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { actionErrorMessage, applyApiFieldErrors } from '../../lib/http-client';
import { useToast } from '../shell/toast-provider';

/** A question to answer before a save that takes something away, in the words the dialog shows. */
export interface SaveConfirmation {
  title: string;
  description: string;
  /** The verb of the button that goes ahead; the dialog's own Cancel is the way out. */
  actionLabel: string;
  /** Red for what cannot be undone; the plain button for what can. */
  destructive?: boolean;
}

export interface SavedFormOptions<Values extends FieldValues, Saved> {
  /** The record as the route loaded it: the form starts from it. */
  saved: Saved;
  /** The form's own options: a resolver, if it has one. */
  form?: Omit<UseFormProps<Values>, 'defaultValues' | 'values'>;
  /**
   * What a failed save says when the server gave nothing better — a sentence
   * that names what was not saved ("The languages were not saved. Try
   * again."), not a generic "something went wrong": the person has to know
   * which of the things they just changed is not safe.
   */
  failedMessage: string;
  /** What the form shows of a record — of the loaded one, and of the one a save answers with. */
  toFormValues: (saved: Saved) => Values;
  /** Sends what the form holds once it is valid, and answers with the record the server kept. */
  save: (values: Values) => Promise<Saved>;
  isSaving: boolean;
  /**
   * The API's name for a field the form calls something else: a 400 that
   * says `businessPhone` is wrong is put under the form's `phone`. Names
   * that are the same in both need nothing here.
   */
  fieldAliases?: Partial<Record<string, Path<Values>>>;
  /**
   * The words for a refusal that names no field, when the caller knows a
   * better sentence than the server's — a 409 that means "that address is
   * taken". `undefined` leaves it to the server's own.
   */
  describeError?: (error: unknown) => string | undefined;
  /**
   * Asked once the form is valid and before anything is sent: what is being
   * saved, and what was saved last. A question comes back when this save
   * turns something off or takes something away — and only then; `null`
   * saves at once, as every other change does. May ask the server first —
   * how many answers a shorter retention would delete — so it may be
   * asynchronous; the bar waits for it.
   */
  confirmBeforeSave?: (
    values: Values,
    savedValues: Values,
  ) => SaveConfirmation | null | Promise<SaveConfirmation | null>;
}

/**
 * Everything a screen that edits one record as a form does besides drawing
 * its own fields: fill the form from the record, save, take the answer as
 * the new saved state (so the bar goes away), say so, and say why when the
 * save is refused. Its `section` goes straight into `SettingsForm`.
 *
 * Written for the site's settings, and lifted out when a term of a category
 * — a record of its own, with its own page — needed exactly the same.
 */
export function useSavedForm<Values extends FieldValues, Saved>({
  saved,
  form: formOptions,
  failedMessage,
  toFormValues,
  save,
  isSaving,
  fieldAliases,
  describeError,
  confirmBeforeSave,
}: SavedFormOptions<Values, Saved>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [error, setError] = useState('');
  // Waiting for the answer to the question a save has to ask first.
  const [isChecking, setIsChecking] = useState(false);

  // A snapshot, not the live record: a refetch while somebody is typing
  // must not put the saved values back over what they have typed.
  const [initialValues] = useState(() => toFormValues(saved));
  const form = useForm<Values>({ ...formOptions, values: initialValues });
  const { isDirty } = form.formState;
  // What the server has, in the form's terms: what a question about a save
  // is asked against.
  const savedValues = useRef(initialValues);
  const [pending, setPending] = useState<{
    values: Values;
    confirmation: SaveConfirmation;
  } | null>(null);

  async function submit(values: Values) {
    setError('');
    try {
      const updated = await save(values);
      // What the server kept is the saved state now — it may not be what
      // was sent (a value is trimmed, an empty one becomes null) — and
      // nothing is left to save.
      const kept = toFormValues(updated);
      savedValues.current = kept;
      form.reset(kept);
      toast(t('saveBar.saved'), 'success');
    } catch (err) {
      // A refusal that names the field goes under that field; only what
      // does not is said at the foot of the form.
      const placed = applyApiFieldErrors(
        err,
        form.setError,
        form.getValues(),
        fieldAliases,
      );
      if (!placed) {
        setError(
          describeError?.(err) ?? actionErrorMessage(err, failedMessage),
        );
      }
    }
  }

  return {
    form,
    /** Puts a message at the foot of the form — a refusal the API gives that names no field, found by the caller. */
    setError,
    section: {
      error,
      isDirty,
      isSaving: isSaving || isChecking,
      onSubmit: (event: FormEvent<HTMLFormElement>) =>
        void form.handleSubmit(async (values) => {
          setIsChecking(true);
          let confirmation: SaveConfirmation | null;
          try {
            confirmation =
              (await confirmBeforeSave?.(values, savedValues.current)) ?? null;
          } finally {
            setIsChecking(false);
          }
          if (confirmation) setPending({ values, confirmation });
          else await submit(values);
        })(event),
      confirmation: pending
        ? {
            ...pending.confirmation,
            onConfirm: () => {
              setPending(null);
              void submit(pending.values);
            },
            onCancel: () => setPending(null),
          }
        : null,
      onCancel: () => {
        setError('');
        form.reset();
      },
    },
  };
}
