import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';

export interface SelectionBarProps {
  /** Names the region for a screen reader: "Actions on the selected pages". */
  label: string;
  /** How many are ticked, in the list's own words and plural: "3 selected". */
  countText: string;
  onClear: () => void;
  /** The actions, each a `Button size="sm"` with an icon and its name. */
  children: ReactNode;
}

/**
 * What can be done to the rows that are ticked, written out once above the
 * list — not as pictures on every row that appeared only when the row was
 * selected, so that what a row could do was a thing you had to click it to
 * find out.
 *
 * The frame is shared by every list that can be acted on together (pages,
 * forms); what goes in it is each list's own. It sticks to the top of the
 * scroll, so a long list does not scroll the actions away from the ticks.
 */
export function SelectionBar({
  label,
  countText,
  onClear,
  children,
}: SelectionBarProps) {
  const { t } = useTranslation();

  return (
    <div
      role="region"
      aria-label={label}
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm"
    >
      <span role="status" className="text-sm font-medium">
        {countText}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        {t('common.selection.clear')}
      </Button>
      <span className="flex-1" />
      {children}
    </div>
  );
}
