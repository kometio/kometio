import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { SiteRecord } from '@kometio/api-contracts';
import {
  type GenerateLegalDocumentsResponse,
  type PreviewLegalDocumentsResponse,
} from '../../lib/legal-documents-api-client';
import { Button } from '../../components/ui/button';
import {
  useGenerateLegalDocuments,
  usePreviewLegalDocuments,
} from './use-generate-legal-documents';
import { InlineError } from '../../components/ui/inline-error';
import { actionErrorMessage } from '../../lib/http-client';
import { SettingsSectionHeader } from '../settings/settings-section';
import { DocumentsStep } from './legal-wizard-documents-step';
import { IdentityStep } from './legal-wizard-identity-step';
import { ReviewStep } from './legal-wizard-review-step';
import { UsageStep } from './legal-wizard-usage-step';
import {
  STEP_FIELDS,
  STEPS,
  toAnswers,
  toDefaultValues,
  type WizardFormValues,
  type WizardStep,
} from './legal-wizard-values';

export interface LegalDocumentsWizardProps {
  siteId: string;
  site: SiteRecord;
}

/**
 * The generator's stepper (docs/adr/0040): a single `useForm` instance holds
 * every answer across all 4 steps (ADR-0027's react-hook-form, extended here
 * to a multi-step flow rather than a single-shot dialog), with `trigger()`
 * gating each "Avanti". Iubenda's own flow inspired the shape, but Kometio's
 * version pre-fills what it already knows (BusinessInfo, enabledLocales,
 * formSubmissionRetentionDays, the categorized tracker list) instead of
 * asking blind — see LegalDocumentAnswers's own comment.
 */
export function LegalDocumentsWizard({
  siteId,
  site,
}: LegalDocumentsWizardProps) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  // The index never leaves the list (`goNext` and `goBack` clamp it).
  const step = STEPS[stepIndex] ?? 'identity';
  const [preview, setPreview] = useState<PreviewLegalDocumentsResponse | null>(
    null,
  );
  const [result, setResult] = useState<GenerateLegalDocumentsResponse | null>(
    null,
  );

  const {
    preview: runPreview,
    isPreviewing,
    previewError,
  } = usePreviewLegalDocuments(siteId);
  const { generate, isGenerating, generateError } =
    useGenerateLegalDocuments(siteId);

  // Set each time Next finds something wrong, and left alone until the next
  // one: the first effect below looks for the field to put the focus on
  // once the errors are drawn, the second keeps them true while they are
  // fixed.
  const [attempt, setAttempt] = useState<{ step: WizardStep } | null>(null);

  const { register, control, handleSubmit, trigger, getValues } =
    useForm<WizardFormValues>({ defaultValues: toDefaultValues(site) });
  const confirmed = useWatch({ control, name: 'confirmed' });
  const answers = useWatch({ control });

  useEffect(() => {
    if (!attempt) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [attempt]);

  // Nothing is judged until Next has been pressed on the step; from then on
  // a fix takes its sentence away at the keystroke that makes it right,
  // without waiting for the field to be left. "Not an email" under "a@"
  // while it is still being typed is nagging, which is why not before.
  useEffect(() => {
    if (attempt?.step !== step) return;
    void trigger(STEP_FIELDS[step]);
  }, [answers, attempt, step, trigger]);

  useEffect(() => {
    if (step !== 'review' || preview) return;
    const values = getValues();
    void runPreview({
      documents: values.documents,
      locales: values.locales,
      answers: toAnswers(values),
    })
      .then(setPreview)
      // Said on the review step through `previewError`; nothing else to do.
      .catch(() => undefined);
    // Only re-run when landing on the review step, not on every keystroke —
    // "Indietro" clears `preview` (below) so fixing an earlier answer and
    // stepping forward again naturally re-triggers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, preview]);

  async function goNext() {
    const valid = await trigger(STEP_FIELDS[step]);
    if (!valid) {
      setAttempt({ step });
      return;
    }
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }

  function goBack() {
    setPreview(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  async function onGenerate(values: WizardFormValues) {
    try {
      setResult(
        await generate({
          documents: values.documents,
          locales: values.locales,
          answers: toAnswers(values),
        }),
      );
    } catch {
      // Said under the form through `generateError`; there is no result.
    }
  }

  /**
   * The form's one way of moving on, from Next or from Enter in a field: it
   * asks the step, and only on the last one does it generate. Enter must
   * never send the documents off with the answers of steps that were not
   * given.
   */
  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 'review') void handleSubmit(onGenerate)(event);
    else void goNext();
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <SettingsSectionHeader
          title={t('legalDocuments.successTitle')}
          description={t('legalDocuments.successHint')}
        />
        <ul className="flex flex-col gap-2">
          {result.documents.map((doc) => (
            <li
              key={doc.pageGroupId}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span className="text-sm font-medium">
                {t(`legalDocuments.kind.${doc.kind}`)}
              </span>
              <Link
                to="/page-groups/$groupId"
                params={{ groupId: doc.pageGroupId }}
                className="text-sm text-primary underline-offset-2 hover:underline"
              >
                {t('legalDocuments.openDraft')}
              </Link>
            </li>
          ))}
        </ul>
        <div>
          <Button variant="outline" asChild>
            <Link to="/settings/cookies">
              <ArrowLeft />
              {t('legalDocuments.backToCookies')}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleFormSubmit}
      noValidate
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-3">
        <Link
          to="/settings/cookies"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t('legalDocuments.backToCookies')}
        </Link>
        <SettingsSectionHeader
          title={t('legalDocuments.title')}
          description={t('legalDocuments.intro')}
        />
      </div>

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {STEPS.map((s, index) => (
          <li
            key={s}
            aria-current={index === stepIndex ? 'step' : undefined}
            className={
              index === stepIndex ? 'font-semibold text-foreground' : undefined
            }
          >
            {index + 1}. {t(`legalDocuments.step.${s}`)}
            {index < STEPS.length - 1 ? ' →' : ''}
          </li>
        ))}
      </ol>

      {step === 'identity' && (
        <IdentityStep register={register} control={control} />
      )}
      {step === 'usage' && <UsageStep register={register} control={control} />}
      {step === 'documents' && (
        <DocumentsStep control={control} enabledLocales={site.enabledLocales} />
      )}
      {step === 'review' && (
        <ReviewStep
          control={control}
          preview={preview}
          isPreviewing={isPreviewing}
          previewError={previewError}
        />
      )}

      {generateError != null && (
        <InlineError>
          {actionErrorMessage(
            generateError,
            t('legalDocuments.generateFailed'),
          )}
        </InlineError>
      )}

      <div className="flex items-center gap-3">
        {stepIndex > 0 && (
          <Button type="button" variant="outline" onClick={goBack}>
            {t('legalDocuments.back')}
          </Button>
        )}
        {step !== 'review' ? (
          // A submit button, so Enter in a field is "Next": a form with
          // several text fields and no submit button does nothing when
          // Enter is pressed. The keys keep the two apart, so the browser
          // does not carry one button's `type` over to the other.
          <Button key="next" type="submit">
            {t('legalDocuments.next')}
          </Button>
        ) : (
          <Button
            key="generate"
            type="submit"
            disabled={isGenerating || !confirmed}
          >
            {isGenerating
              ? t('legalDocuments.generating')
              : t('legalDocuments.generate')}
          </Button>
        )}
      </div>
    </form>
  );
}
