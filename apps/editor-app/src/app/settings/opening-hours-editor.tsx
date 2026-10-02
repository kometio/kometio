import { useTranslation } from 'react-i18next';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { DayOfWeek, OpeningHoursDay } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { InlineError } from '../../components/ui/inline-error';
import {
  copyMondayToWeekdays,
  opensAndClosesApart,
  runsPastMidnight,
} from './opening-hours';

const DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface OpeningHoursEditorProps {
  value: OpeningHoursDay[];
  onChange: (value: OpeningHoursDay[]) => void;
}

// Always renders all 7 days — the caller (BusinessInfoDialog) fills in the
// skeleton once from a possibly-null API value, this component never has
// to reason about a partial week.
export function OpeningHoursEditor({
  value,
  onChange,
}: OpeningHoursEditorProps) {
  const { t } = useTranslation();

  function rangesFor(day: DayOfWeek) {
    return value.find((d) => d.dayOfWeek === day)?.ranges ?? [];
  }

  function updateDay(day: DayOfWeek, ranges: OpeningHoursDay['ranges']) {
    onChange(
      DAYS.map((d) => ({
        dayOfWeek: d,
        ranges: d === day ? ranges : rangesFor(d),
      })),
    );
  }

  function addRange(day: DayOfWeek) {
    updateDay(day, [...rangesFor(day), { opens: '09:00', closes: '18:00' }]);
  }

  function removeRange(day: DayOfWeek, index: number) {
    updateDay(
      day,
      rangesFor(day).filter((_, i) => i !== index),
    );
  }

  function changeRange(
    day: DayOfWeek,
    index: number,
    field: 'opens' | 'closes',
    time: string,
  ) {
    updateDay(
      day,
      rangesFor(day).map((range, i) =>
        i === index ? { ...range, [field]: time } : range,
      ),
    );
  }

  const mondayIsOpen = rangesFor('monday').length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Most shops open the same hours all week: type Monday, copy it. */}
      {mondayIsOpen && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange(copyMondayToWeekdays(value))}
        >
          <Copy className="size-3.5" />
          {t('openingHours.copyMonday')}
        </Button>
      )}
      {DAYS.map((day) => {
        const ranges = rangesFor(day);
        return (
          <div key={day} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t(`openingHours.days.${day}`)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addRange(day)}
              >
                <Plus className="size-3.5" />
                {t('openingHours.addRange')}
              </Button>
            </div>
            {ranges.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('openingHours.closed')}
              </p>
            ) : (
              // No stable id per range — index is fine, only ever
              // appended/removed here, never reordered.
              ranges.map((range, index) => {
                const dayName = t(`openingHours.days.${day}`);
                const isValid = opensAndClosesApart(range);
                const pastMidnight = runsPastMidnight(range);
                const errorId = `opening-hours-${day}-${index}-error`;
                return (
                  <div key={index} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {/* Named by the day they are for, since the two times
                          sit under its heading and nothing says which of
                          them is which: the box on its own is "a time". */}
                      <Input
                        type="time"
                        aria-label={t('openingHours.opens', { day: dayName })}
                        value={range.opens}
                        onChange={(event) =>
                          changeRange(day, index, 'opens', event.target.value)
                        }
                        className="w-28"
                      />
                      <span aria-hidden className="text-muted-foreground">
                        –
                      </span>
                      <Input
                        type="time"
                        aria-label={t('openingHours.closes', { day: dayName })}
                        aria-invalid={isValid ? undefined : true}
                        aria-describedby={isValid ? undefined : errorId}
                        value={range.closes}
                        onChange={(event) =>
                          changeRange(day, index, 'closes', event.target.value)
                        }
                        className="w-28"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('openingHours.removeRangeNamed', {
                          day: dayName,
                        })}
                        onClick={() => removeRange(day, index)}
                      >
                        <Trash2 />
                        {t('openingHours.removeRange')}
                      </Button>
                    </div>
                    {!isValid && (
                      <InlineError id={errorId} className="text-xs">
                        {t('openingHours.sameTime')}
                      </InlineError>
                    )}
                    {/* Not a mistake, and not left to be guessed: it is
                        read as the next day. */}
                    {pastMidnight && (
                      <p className="text-xs text-muted-foreground">
                        {t('openingHours.pastMidnight', {
                          time: range.closes,
                        })}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
