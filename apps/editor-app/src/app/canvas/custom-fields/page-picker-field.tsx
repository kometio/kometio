import { pickedPageSchema, type PickedPage } from '@kometio/shared-types';
import { useTranslation } from '../../../lib/use-translation';
import { Button } from '../../../components/ui/button';
import { readPickedValue } from './read-picked-value';
import { usePageList } from '../../pages/page-list-context';

export interface PagePickerFieldProps {
  /** Checked, not assumed — see `readPickedValue`. */
  value: unknown;
  onChange: (value: PickedPage | null) => void;
}

export function PagePickerField({
  value: stored,
  onChange,
}: PagePickerFieldProps) {
  const { t } = useTranslation();
  const { pick } = usePageList();
  const value = readPickedValue(pickedPageSchema, stored);

  async function handlePick() {
    const picked = await pick();
    if (picked) onChange(picked);
  }

  return (
    <div className="flex flex-col gap-2">
      {value && <p className="m-0 text-sm">{value.title}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => void handlePick()}
      >
        {value
          ? t('canvas.pickers.page.change')
          : t('canvas.pickers.page.choose')}
      </Button>
    </div>
  );
}
