import { useTranslation } from 'react-i18next';
import { OptionsSelect } from '../../components/ui/select';
import { COLLECTION_ICON_NAMES, CollectionIcon } from './collection-icons';

export interface CollectionIconSelectProps {
  id?: string;
  /** A stored icon name; one this editor no longer knows reads as the default's. */
  value: string;
  onChange: (name: string) => void;
}

/**
 * The icon a collection wears in the menu, chosen from a list that shows
 * each one with a name for what it usually holds — "News", "Events",
 * "Portfolio" — and not by its shape, which is what a grid of bare glyphs
 * left somebody to guess. Used where a collection is made and where it is
 * changed later.
 */
export function CollectionIconSelect({
  id,
  value,
  onChange,
}: CollectionIconSelectProps) {
  const { t } = useTranslation();
  return (
    <OptionsSelect
      id={id}
      value={value}
      onValueChange={onChange}
      options={COLLECTION_ICON_NAMES.map((name) => ({
        value: name,
        label: (
          <span className="flex items-center gap-2">
            <CollectionIcon name={name} className="size-4 shrink-0" />
            {t(`collections.dialog.icons.${name}`)}
          </span>
        ),
      }))}
    />
  );
}
