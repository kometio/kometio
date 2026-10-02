import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type PreviewLegalDocumentsResponse } from '../../lib/legal-documents-api-client';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion';
import { InlineError } from '../../components/ui/inline-error';
import { actionErrorMessage } from '../../lib/http-client';
import type { Control } from 'react-hook-form';
import type { WizardFormValues } from './legal-wizard-values';

export interface ReviewStepProps {
  control: Control<WizardFormValues>;
  preview: PreviewLegalDocumentsResponse | null;
  isPreviewing: boolean;
  previewError: unknown;
}

export function ReviewStep({
  control,
  preview,
  isPreviewing,
  previewError,
}: ReviewStepProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        {t('legalDocuments.disclaimer')}
      </p>

      {isPreviewing && (
        <p className="text-sm text-muted-foreground">
          {t('legalDocuments.loadingPreview')}
        </p>
      )}
      {previewError != null && (
        <InlineError>
          {actionErrorMessage(previewError, t('legalDocuments.previewFailed'))}
        </InlineError>
      )}
      {preview && (
        <Accordion type="multiple">
          {preview.documents.map((doc) =>
            Object.entries(doc.locales).map(([locale, outline]) => (
              <AccordionItem
                key={`${doc.kind}-${locale}`}
                value={`${doc.kind}-${locale}`}
              >
                <AccordionTrigger>
                  {t(`legalDocuments.kind.${doc.kind}`)} —{' '}
                  {locale.toUpperCase()}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-3 text-sm">
                    <p className="font-semibold">{outline.title}</p>
                    {outline.sections.map((section) => (
                      <div key={section.heading}>
                        <p className="font-medium">{section.heading}</p>
                        {section.paragraphs.map((paragraph, index) => (
                          <p key={index} className="text-muted-foreground">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )),
          )}
        </Accordion>
      )}

      <Controller
        control={control}
        name="confirmed"
        rules={{ validate: (value) => value === true }}
        render={({ field }) => (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            {t('legalDocuments.confirmLabel')}
          </label>
        )}
      />
    </div>
  );
}
