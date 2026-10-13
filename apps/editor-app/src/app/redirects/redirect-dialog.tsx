import { useId, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocaleDisplayName } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { ChoiceGroup } from '../../components/ui/choice-group';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { RadioGroup } from '../../components/ui/radio-group';
import { OptionsSelect } from '../../components/ui/select';
import { actionErrorMessage } from '../../lib/http-client';
import type { RedirectRecord } from '../../lib/redirects-api-client';
import { RadioOption } from '../common/radio-option';
import { useIsDemo } from '../common/deployment-queries';
import { PagePickerDialog } from '../pages/page-picker-dialog';
import { DestinationCheck } from './destination-check';
import { readTypedAddress } from './redirect-address-reading';
import {
  bodyFromForm,
  emptyRedirectForm,
  formFromRecord,
  type DestinationChoice,
  type RedirectFormBody,
  type RedirectFormValues,
} from './redirect-form';
import {
  describeRedirectProblem,
  redirectProblemOf,
} from './redirect-problems';

export interface RedirectDialogProps {
  siteId: string;
  defaultLocale: string;
  enabledLocales: readonly string[];
  /** The rule being edited; `null` to add one. */
  redirect: RedirectRecord | null;
  /** The old address an added rule starts with: what was not found, or what was just checked. */
  initialFrom?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: RedirectFormBody) => Promise<void>;
}

const DESTINATIONS: readonly DestinationChoice[] = ['page', 'url', 'gone'];

function isDestination(value: string): value is DestinationChoice {
  return DESTINATIONS.some((choice) => choice === value);
}

/**
 * One rule, added or edited: the old address, where it goes, and how.
 *
 * Mounted while it is open, so every opening starts from the rule (or an
 * empty one) and nothing of the last is left in it.
 *
 * What a person types is read as the server will read it (`shared-types`),
 * and said under the field while they type: the address as it will be kept,
 * whether it is a pattern, which parts a destination may reuse. A mistake is
 * said once the field has been left, not on the way to a correct address.
 */
export function RedirectDialog({
  siteId,
  defaultLocale,
  enabledLocales,
  redirect,
  initialFrom = '',
  onOpenChange,
  onSubmit,
}: RedirectDialogProps) {
  const { t, i18n } = useTranslation();
  const isDemo = useIsDemo();
  const ids = useId();
  const [values, setValues] = useState<RedirectFormValues>(() =>
    redirect === null
      ? emptyRedirectForm(defaultLocale, initialFrom)
      : formFromRecord(redirect),
  );
  const [fromTouched, setFromTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fromError, setFromError] = useState('');
  const [destinationError, setDestinationError] = useState('');
  const [formError, setFormError] = useState('');

  const reading = useMemo(() => readTypedAddress(values.from), [values.from]);
  const isEditing = redirect !== null;
  const locale = values.locale || defaultLocale;

  function change(patch: Partial<RedirectFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setDestinationError('');
    setFormError('');
  }

  const fromProblem =
    fromError ||
    (fromTouched && reading.state === 'problem'
      ? describeRedirectProblem(t, reading.problem)
      : '');
  const fromHintId = `${ids}-from-hint`;
  const fromErrorId = `${ids}-from-error`;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFromTouched(true);
    setFromError('');
    setDestinationError('');
    setFormError('');
    if (reading.state !== 'exact' && reading.state !== 'pattern') {
      // `fromProblem` says why, from the reading, now that it is touched; an
      // empty field has its own sentence.
      if (reading.state === 'empty') {
        setFromError(
          describeRedirectProblem(t, { side: 'source', problem: 'empty' }),
        );
      }
      return;
    }
    const body = bodyFromForm(values, defaultLocale);
    if (body === null) {
      setDestinationError(
        values.destination === 'page'
          ? t('redirects.dialog.to.page.missing')
          : describeRedirectProblem(t, { side: 'target', problem: 'empty' }),
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(body);
      onOpenChange(false);
    } catch (error) {
      const problem = redirectProblemOf(error);
      if (problem?.side === 'source') {
        setFromError(describeRedirectProblem(t, problem));
      } else if (problem?.side === 'target') {
        setDestinationError(describeRedirectProblem(t, problem));
      } else if (problem) {
        setFormError(describeRedirectProblem(t, problem));
      } else {
        setFormError(actionErrorMessage(error, t('redirects.dialog.failed')));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const localeOptions = enabledLocales.map((code) => ({
    value: code,
    label: getLocaleDisplayName(code, i18n.language),
  }));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('redirects.dialog.editTitle')
              : t('redirects.dialog.addTitle')}
          </DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-from`}>
              {t('redirects.dialog.from.label')}
            </Label>
            <Input
              id={`${ids}-from`}
              value={values.from}
              onChange={(event) => {
                setFromError('');
                change({ from: event.target.value });
              }}
              onBlur={() => setFromTouched(true)}
              placeholder={t('redirects.dialog.from.placeholder')}
              autoFocus={!isEditing && initialFrom === ''}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={fromProblem !== '' ? true : undefined}
              aria-describedby={fromProblem !== '' ? fromErrorId : fromHintId}
            />
            {/* One slot, one thing in it: a mistake takes the place of the
                reading instead of being added under it. Leaving the field
                by pressing on the next control is a mousedown that blurs
                this one — an error that pushed the page down at that moment
                moved the control from under the pointer, and the click was
                lost. */}
            {fromProblem !== '' ? (
              <InlineError id={fromErrorId}>{fromProblem}</InlineError>
            ) : (
              <div id={fromHintId} className="flex flex-col gap-0.5">
                <AddressReadingLine reading={reading} typed={values.from} />
              </div>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              {t('redirects.dialog.to.legend')}
            </legend>
            <RadioGroup
              value={values.destination}
              onValueChange={(next) => {
                if (isDestination(next)) change({ destination: next });
              }}
            >
              <RadioOption
                id={`${ids}-to-page`}
                value="page"
                label={t('redirects.dialog.to.page.label')}
                description={t('redirects.dialog.to.page.description')}
              >
                {values.destination === 'page' && (
                  <div className="flex flex-col gap-2 pt-1">
                    {enabledLocales.length > 1 && (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`${ids}-language`} className="text-xs">
                          {t('redirects.dialog.to.page.language')}
                        </Label>
                        <OptionsSelect
                          id={`${ids}-language`}
                          size="sm"
                          className="w-auto"
                          value={locale}
                          // A page is chosen in a language: another language
                          // is another list of pages, so the choice is open
                          // again rather than kept for a page that may not
                          // exist there.
                          onValueChange={(next) =>
                            change({ locale: next, page: null })
                          }
                          options={localeOptions}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-sm">
                        {values.page === null
                          ? t('redirects.dialog.to.page.none')
                          : values.page.title ||
                            t('redirects.dialog.to.page.untitled')}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerOpen(true)}
                      >
                        {values.page === null
                          ? t('redirects.dialog.to.page.choose')
                          : t('redirects.dialog.to.page.change')}
                      </Button>
                    </div>
                  </div>
                )}
              </RadioOption>
              <RadioOption
                id={`${ids}-to-url`}
                value="url"
                label={t('redirects.dialog.to.url.label')}
                description={
                  isDemo
                    ? t('redirects.dialog.to.url.descriptionDemo')
                    : t('redirects.dialog.to.url.description')
                }
              >
                {values.destination === 'url' && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <Label htmlFor={`${ids}-url`} className="sr-only">
                      {t('redirects.dialog.to.url.field')}
                    </Label>
                    <Input
                      id={`${ids}-url`}
                      value={values.url}
                      onChange={(event) => change({ url: event.target.value })}
                      placeholder={t('redirects.dialog.to.url.placeholder')}
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={destinationError !== '' ? true : undefined}
                      aria-describedby={`${ids}-url-hint`}
                    />
                    <p
                      id={`${ids}-url-hint`}
                      className="text-xs text-muted-foreground"
                    >
                      {t('redirects.dialog.to.url.hint')}
                    </p>
                    <DestinationCheck siteId={siteId} address={values.url} />
                  </div>
                )}
              </RadioOption>
              <RadioOption
                id={`${ids}-to-gone`}
                value="gone"
                label={t('redirects.dialog.to.gone.label')}
                description={t('redirects.dialog.to.gone.description')}
              />
            </RadioGroup>
            <InlineError>{destinationError}</InlineError>
          </fieldset>

          {values.destination !== 'gone' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" aria-hidden>
                {t('redirects.dialog.type.label')}
              </span>
              <ChoiceGroup
                label={t('redirects.dialog.type.label')}
                value={values.kind === 302 ? 'temporary' : 'permanent'}
                onValueChange={(next) =>
                  change({ kind: next === 'temporary' ? 302 : 301 })
                }
                choices={[
                  {
                    value: 'permanent',
                    label: t('redirects.dialog.type.permanent'),
                  },
                  {
                    value: 'temporary',
                    label: t('redirects.dialog.type.temporary'),
                  },
                ]}
                className="w-fit"
              />
              <p className="text-xs text-muted-foreground">
                {values.kind === 302
                  ? t('redirects.dialog.type.temporaryHint')
                  : t('redirects.dialog.type.permanentHint')}
              </p>
            </div>
          )}

          <InlineError>{formError}</InlineError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t('redirects.dialog.saving')
                : isEditing
                  ? t('redirects.dialog.save')
                  : t('redirects.dialog.add')}
            </Button>
          </DialogFooter>
        </form>
        <PagePickerDialog
          siteId={siteId}
          locale={locale}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(page) => {
            change({
              page: { pageGroupId: page.pageGroupId, title: page.title },
            });
            setPickerOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddressReadingLine({
  reading,
  typed,
}: {
  reading: ReturnType<typeof readTypedAddress>;
  /** What is in the field, to say the kept form only where it is not what was typed. */
  typed: string;
}) {
  const { t } = useTranslation();
  if (reading.state === 'empty' || reading.state === 'problem') {
    return (
      <p className="text-xs text-muted-foreground">
        {t('redirects.dialog.from.hint')}
      </p>
    );
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">
        {reading.state === 'exact' ? (
          t('redirects.dialog.from.exact', { address: reading.shown })
        ) : (
          <>
            {t('redirects.dialog.from.pattern')}
            {reading.shown !== typed.trim() && (
              <>
                {' '}
                <span className="font-mono">{reading.shown}</span>
              </>
            )}
          </>
        )}
      </p>
      {reading.state === 'pattern' && (
        <p className="text-xs text-muted-foreground">
          {t('redirects.dialog.from.placeholders', {
            names: reading.placeholders.join(', '),
          })}
        </p>
      )}
    </>
  );
}
