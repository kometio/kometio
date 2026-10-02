import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import {
  formFieldTypeSchema,
  type FormConditionProblem,
  type FormField,
  type FormFieldType,
  type FormStep,
} from '@kometio/shared-types';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { OptionsSelect } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { IconButton } from '../common/icon-button';
import { InlineError } from '../../components/ui/inline-error';

// "No step assigned" and "always shown" — never a real step or field id
// (crypto.randomUUID() strings, see form-editor-view.tsx), so neither can
// collide with one.
const NO_STEP_VALUE = '';
const ALWAYS_SHOWN = '';

/** A condition on a select names one of its options, or any answer at all. */
const ANY_ANSWER = '';

const FIELD_TYPES = formFieldTypeSchema.options;

function isFieldType(value: string): value is FormFieldType {
  return FIELD_TYPES.some((type) => type === value);
}

export interface FormFieldEditorRowProps {
  field: FormField;
  onChange: (field: FormField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  // Only rendered (as a step-assignment dropdown below) when the form
  // actually has steps — a single-step form shows nothing extra here,
  // same "renders exactly as before" backward-compat reasoning as
  // Form.astro's own multi-step check.
  steps: FormStep[];
  /** The fields above this one — the only ones its condition may name (see formConditionProblems). */
  earlierFields: FormField[];
  /** What is wrong with its condition, if anything — shown under it rather than refused at save time without a word. */
  conditionProblem?: FormConditionProblem;
}

export function FormFieldEditorRow({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  steps,
  earlierFields,
  conditionProblem,
}: FormFieldEditorRowProps) {
  const { t } = useTranslation();

  function handleTypeChange(type: FormFieldType) {
    onChange({
      ...field,
      type,
      options: type === 'select' ? (field.options ?? []) : undefined,
    });
  }

  // Keeps every line, including a trailing empty one — trimming/filtering
  // here would fight the user's cursor the moment they press Enter for a
  // new option (the just-created blank line would immediately vanish).
  // Sanitizing (trim + drop empty lines) happens once, at save time (see
  // form-editor-view.tsx's handleSave).
  function handleOptionsChange(raw: string) {
    onChange({ ...field, options: raw.split('\n') });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`field-label-${field.id}`}>
            {t('forms.editor.fieldLabelLabel')}
          </Label>
          <Input
            id={`field-label-${field.id}`}
            value={field.label}
            onChange={(event) =>
              onChange({ ...field, label: event.target.value })
            }
          />
        </div>
        <div className="flex w-40 flex-col gap-2">
          <Label htmlFor={`field-type-${field.id}`}>
            {t('forms.editor.fieldTypeLabel')}
          </Label>
          <OptionsSelect
            id={`field-type-${field.id}`}
            value={field.type}
            onValueChange={(type) => {
              if (isFieldType(type)) handleTypeChange(type);
            }}
            options={FIELD_TYPES.map((type) => ({
              value: type,
              label: t(`forms.editor.fieldTypes.${type}`),
            }))}
          />
        </div>
      </div>
      {steps.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`field-step-${field.id}`}>
            {t('forms.editor.fieldStepLabel')}
          </Label>
          <OptionsSelect
            id={`field-step-${field.id}`}
            value={field.stepId ?? NO_STEP_VALUE}
            onValueChange={(stepId) =>
              onChange({ ...field, stepId: stepId || null })
            }
            options={[
              { value: NO_STEP_VALUE, label: t('forms.editor.fieldStepNone') },
              ...steps.map((step) => ({
                value: step.id,
                label: step.title || t('forms.editor.untitledStep'),
              })),
            ]}
          />
        </div>
      )}
      {field.type === 'select' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`field-options-${field.id}`}>
            {t('forms.editor.fieldOptionsLabel')}
          </Label>
          <Textarea
            id={`field-options-${field.id}`}
            value={(field.options ?? []).join('\n')}
            onChange={(event) => handleOptionsChange(event.target.value)}
            placeholder={t('forms.editor.fieldOptionsPlaceholder')}
          />
        </div>
      )}
      <FieldConditionEditor
        field={field}
        earlierFields={earlierFields}
        problem={conditionProblem}
        onChange={onChange}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id={`field-required-${field.id}`}
            size="sm"
            checked={field.required}
            onCheckedChange={(checked) =>
              onChange({ ...field, required: checked })
            }
          />
          {/* A real label, so pressing its words turns the switch, and a
              screen reader names the switch by it. */}
          <Label
            htmlFor={`field-required-${field.id}`}
            className="text-sm font-normal text-muted-foreground"
          >
            {t('forms.editor.fieldRequiredLabel')}
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            label={t('forms.editor.moveFieldUp')}
            disabled={!canMoveUp}
            onClick={onMoveUp}
          >
            <ArrowUp />
          </IconButton>
          <IconButton
            label={t('forms.editor.moveFieldDown')}
            disabled={!canMoveDown}
            onClick={onMoveDown}
          >
            <ArrowDown />
          </IconButton>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 />
            {t('forms.editor.removeField')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Show only when…": which earlier field, and which answer. The second
 * choice depends on what that field is — an option for a select, a ticked
 * box for a checkbox, any answer for the rest — so it is only asked when
 * it means something.
 */
function FieldConditionEditor({
  field,
  earlierFields,
  problem,
  onChange,
}: {
  field: FormField;
  earlierFields: FormField[];
  problem?: FormConditionProblem;
  onChange: (field: FormField) => void;
}) {
  const { t } = useTranslation();
  const condition = field.showWhen ?? null;
  const controller = condition
    ? earlierFields.find((candidate) => candidate.id === condition.fieldId)
    : undefined;
  const problemId = `field-condition-problem-${field.id}`;

  if (earlierFields.length === 0 && !condition) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`field-condition-${field.id}`}>
        {t('forms.editor.conditionLabel')}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <OptionsSelect
          id={`field-condition-${field.id}`}
          value={condition?.fieldId ?? ALWAYS_SHOWN}
          aria-describedby={problem ? problemId : undefined}
          onValueChange={(fieldId) =>
            onChange({
              ...field,
              showWhen: fieldId ? { fieldId, equals: null } : null,
            })
          }
          options={[
            { value: ALWAYS_SHOWN, label: t('forms.editor.conditionAlways') },
            ...earlierFields.map((candidate) => ({
              value: candidate.id,
              label: t('forms.editor.conditionWhen', {
                field: candidate.label || t('forms.editor.untitledField'),
              }),
            })),
          ]}
        />
        {condition && controller?.type === 'select' && (
          <OptionsSelect
            aria-label={t('forms.editor.conditionAnswerLabel')}
            value={condition.equals ?? ANY_ANSWER}
            onValueChange={(equals) =>
              onChange({
                ...field,
                showWhen: {
                  fieldId: condition.fieldId,
                  equals: equals || null,
                },
              })
            }
            options={[
              {
                value: ANY_ANSWER,
                label: t('forms.editor.conditionAnyAnswer'),
              },
              ...(controller.options ?? [])
                .map((option) => option.trim())
                .filter((option) => option !== '')
                .map((option) => ({
                  value: option,
                  label: t('forms.editor.conditionIs', { option }),
                })),
            ]}
          />
        )}
        {condition && controller && controller.type !== 'select' && (
          <p className="self-center text-sm text-muted-foreground">
            {controller.type === 'checkbox' ||
            controller.type === 'newsletter-consent'
              ? t('forms.editor.conditionIsTicked')
              : t('forms.editor.conditionIsFilled')}
          </p>
        )}
      </div>
      {problem && (
        <InlineError id={problemId}>
          {t(`forms.editor.conditionProblems.${problem}`)}
        </InlineError>
      )}
    </div>
  );
}
