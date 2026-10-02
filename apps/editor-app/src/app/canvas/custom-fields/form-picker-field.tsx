import { pickedFormSchema, type PickedForm } from '@kometio/shared-types';
import { useTranslation } from '../../../lib/use-translation';
import { Button } from '../../../components/ui/button';
import { readPickedValue } from './read-picked-value';
import { useFormList } from '../../forms/form-list-context';

export interface FormPickerFieldProps {
  /** Checked, not assumed — see `readPickedValue`. */
  value: unknown;
  onChange: (value: PickedForm | null) => void;
}

export function FormPickerField({
  value: stored,
  onChange,
}: FormPickerFieldProps) {
  const { t } = useTranslation();
  const { pick } = useFormList();
  const value = readPickedValue(pickedFormSchema, stored);

  async function handlePick() {
    const picked = await pick();
    if (picked) onChange(picked);
  }

  return (
    <div className="flex flex-col gap-2">
      {value && <p className="m-0 text-sm">{value.formName}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => void handlePick()}
      >
        {value
          ? t('canvas.pickers.form.change')
          : t('canvas.pickers.form.choose')}
      </Button>
    </div>
  );
}
