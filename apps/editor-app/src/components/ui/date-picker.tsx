import { lazy, Suspense, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { useTranslation } from '../../lib/use-translation';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { useFormatDate } from '../../lib/use-format-date';

/**
 * A date as the editor stores it: `YYYY-MM-DD`, the one spelling that sorts
 * and compares as text and names the same day in every language. Read and
 * written through the date's own local parts, never `new Date(string)`,
 * which reads a bare date as midnight UTC and turns it into the day before
 * anywhere west of Greenwich.
 */
function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function toIsoDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Loaded when a calendar is first opened — see calendar.tsx for why. */
const Calendar = lazy(() => import('./calendar'));

/**
 * A date field that opens a calendar, in place of the browser's own date
 * input, which looked and behaved differently in every browser and could
 * not be told which language to speak.
 *
 * The value stays a `YYYY-MM-DD` string, so nothing that reads a stored
 * date changes; clearing it gives the empty string, "no date".
 */
export function DatePicker({
  id,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const { t, i18n } = useTranslation();
  const formatDate = useFormatDate();
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            'w-full justify-start font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon aria-hidden />
          {selected ? formatDate(selected) : t('datePicker.empty')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        aria-label={ariaLabel ?? t('datePicker.calendar')}
      >
        <Suspense fallback={<div className="h-72 w-64" aria-busy="true" />}>
          <Calendar
            selected={selected}
            language={i18n.language}
            onSelect={(day) => choose(day ? toIsoDate(day) : '')}
          />
        </Suspense>
        {selected && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            onClick={() => choose('')}
          >
            {t('datePicker.clear')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
