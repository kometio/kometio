import { DayPicker } from 'react-day-picker';
import { enUS } from 'react-day-picker/locale/en-US';
import { it } from 'react-day-picker/locale/it';
import 'react-day-picker/style.css';
import './calendar.css';

/**
 * The month grid DatePicker opens. Its own module so it is loaded when a
 * calendar is first opened, not with every screen that shows a date field:
 * react-day-picker brings date-fns with it, and date-fns' locale entry
 * brings every language it has. Measured before the split: the pages list
 * took twice as long to appear.
 */
export default function Calendar({
  selected,
  language,
  onSelect,
}: {
  selected: Date | undefined;
  language: string;
  onSelect: (day: Date | undefined) => void;
}) {
  return (
    <DayPicker
      className="kometio-calendar"
      mode="single"
      selected={selected}
      defaultMonth={selected}
      // The calendar's own words — month names, weekdays — in the
      // editor's language.
      locale={language.startsWith('it') ? it : enUS}
      onSelect={onSelect}
    />
  );
}
