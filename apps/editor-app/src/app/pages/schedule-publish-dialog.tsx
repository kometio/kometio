import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { actionErrorMessage } from '../../lib/http-client';
import { browserTimeZone, useFormatDate } from '../../lib/use-format-date';
import { useToast } from '../shell/toast-provider';

export interface SchedulePublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The moment already set, as an ISO instant, or null. */
  scheduledPublishAt: string | null;
  /** Why the last attempt at publishing at that moment did not happen, if it did not. */
  scheduleFailure: string | null;
  /** Rejecting keeps the dialog open and says why. */
  onSchedule: (publishAt: Date) => Promise<void>;
  onCancelSchedule: () => Promise<void>;
  isSaving: boolean;
  /** The clock, for the tests. Otherwise the moment the dialog was opened. */
  now?: Date;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** What a `datetime-local` field holds for a moment, in the time zone of the browser — which is the one the field means. */
function toFieldValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Tomorrow at nine: where somebody who has not chosen yet is most likely to want to start. */
function suggested(from: Date): string {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return toFieldValue(next);
}

function initialValue(scheduledPublishAt: string | null, now: Date): string {
  if (scheduledPublishAt) {
    const set = new Date(scheduledPublishAt);
    if (!Number.isNaN(set.getTime())) return toFieldValue(set);
  }
  return suggested(now);
}

/**
 * Publishes a language of a page at a moment of its own (docs/adr/0135).
 *
 * The moment is typed in the time zone of the person's browser and sent as an
 * instant, so the server has no zone to guess; the dialog names the zone
 * under the field, always, because "09:00" with no place is not a time.
 */
export function SchedulePublishDialog({
  open,
  onOpenChange,
  scheduledPublishAt,
  scheduleFailure,
  onSchedule,
  onCancelSchedule,
  isSaving,
  now,
}: SchedulePublishDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const formatDateTime = useFormatDate('dateTime');
  const [openedAt, setOpenedAt] = useState(() => now ?? new Date());
  const reference = now ?? openedAt;
  const [value, setValue] = useState(() =>
    initialValue(scheduledPublishAt, reference),
  );
  const [error, setError] = useState('');

  // Starts from what is set, or from tomorrow at nine, every time the dialog
  // opens (or the value behind it changes while closed): the "adjust state
  // during render" pattern the SEO dialog uses, not an effect that would
  // paint the old value first.
  const [lastOpened, setLastOpened] = useState({
    open,
    scheduledPublishAt,
  });
  if (
    lastOpened.open !== open ||
    lastOpened.scheduledPublishAt !== scheduledPublishAt
  ) {
    setLastOpened({ open, scheduledPublishAt });
    if (open) {
      const moment = now ?? new Date();
      setOpenedAt(moment);
      setValue(initialValue(scheduledPublishAt, moment));
      setError('');
    }
  }

  const chosen = value ? new Date(value) : null;
  const isAnInstant = chosen !== null && !Number.isNaN(chosen.getTime());
  const isAhead = isAnInstant && chosen.getTime() > reference.getTime();
  const timeZone = browserTimeZone();

  async function handleSchedule() {
    if (!isAnInstant || !isAhead) return;
    setError('');
    try {
      await onSchedule(chosen);
      toast(
        t('pages.schedule.saved', { when: formatDateTime(chosen) ?? '' }),
        'success',
      );
      onOpenChange(false);
    } catch (cause) {
      setError(actionErrorMessage(cause, t('pages.schedule.saveFailed')));
    }
  }

  async function handleCancelSchedule() {
    setError('');
    try {
      await onCancelSchedule();
      toast(t('pages.schedule.removed'), 'success');
      onOpenChange(false);
    } catch (cause) {
      setError(actionErrorMessage(cause, t('pages.schedule.removeFailed')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pages.schedule.title')}</DialogTitle>
          <DialogDescription>
            {t('pages.schedule.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="schedule-publish-at">
              {t('pages.schedule.whenLabel')}
            </Label>
            <Input
              id="schedule-publish-at"
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={isAnInstant && !isAhead}
              aria-describedby="schedule-publish-at-hint"
            />
            {/* A hint and its error share one slot (DESIGN.md): the error
                replaces the hint, in the same place, and does not follow it. */}
            {isAnInstant && !isAhead ? (
              <p
                id="schedule-publish-at-hint"
                className="text-xs text-destructive"
              >
                {t('pages.schedule.notAhead')}
              </p>
            ) : (
              <p
                id="schedule-publish-at-hint"
                className="text-xs text-muted-foreground"
              >
                {t('pages.schedule.timeZoneHint', { timeZone })}
              </p>
            )}
          </div>
          {scheduleFailure && (
            <InlineError>
              {t('pages.schedule.failure', { reason: scheduleFailure })}
            </InlineError>
          )}
          {error && <InlineError>{error}</InlineError>}
        </div>
        <DialogFooter>
          {scheduledPublishAt && (
            <Button
              type="button"
              variant="outline"
              className="sm:mr-auto"
              disabled={isSaving}
              onClick={() => void handleCancelSchedule()}
            >
              {t('pages.schedule.remove')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isSaving || !isAnInstant || !isAhead}
            onClick={() => void handleSchedule()}
          >
            {t('pages.schedule.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
