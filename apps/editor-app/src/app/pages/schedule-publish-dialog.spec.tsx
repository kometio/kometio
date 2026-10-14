import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../components/ui/tooltip';
import { browserTimeZone } from '../../lib/use-format-date';
import { ToastProvider } from '../shell/toast-provider';
import { SchedulePublishDialog } from './schedule-publish-dialog';

// Noon, local time: far enough from midnight that "tomorrow at 9" and
// "an hour ago" are the same calendar day in every time zone a developer's
// machine can be in.
const NOW = new Date(2026, 10, 1, 12, 0, 0);

/** What the `datetime-local` field holds for a local moment. */
function fieldValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof SchedulePublishDialog>> = {},
) {
  const onSchedule = vi.fn().mockResolvedValue(undefined);
  const onCancelSchedule = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <TooltipProvider>
      <ToastProvider>
        <SchedulePublishDialog
          open
          onOpenChange={onOpenChange}
          scheduledPublishAt={null}
          scheduleFailure={null}
          onSchedule={onSchedule}
          onCancelSchedule={onCancelSchedule}
          isSaving={false}
          now={NOW}
          {...props}
        />
      </ToastProvider>
    </TooltipProvider>,
  );
  return { onSchedule, onCancelSchedule, onOpenChange };
}

const field = () => screen.getByLabelText(/Data e ora|Date and time/);

describe('SchedulePublishDialog', () => {
  it('says whose time it is, so that nobody has to guess the time zone', () => {
    renderDialog();

    const zone = browserTimeZone();
    expect(screen.getByText(new RegExp(zone.replace('/', '\\/')))).toBeTruthy();
  });

  it('schedules the moment that was chosen, as an instant', async () => {
    const { onSchedule, onOpenChange } = renderDialog();
    const chosen = new Date(2026, 10, 2, 9, 30, 0);

    fireEvent.change(field(), { target: { value: fieldValue(chosen) } });
    fireEvent.click(
      screen.getByRole('button', { name: /^Programma$|^Schedule$/ }),
    );

    await waitFor(() => expect(onSchedule).toHaveBeenCalledTimes(1));
    expect(onSchedule.mock.calls[0]?.[0]).toEqual(chosen);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('does not take a moment that has passed, and says why', () => {
    const { onSchedule } = renderDialog();

    fireEvent.change(field(), {
      target: { value: fieldValue(new Date(2026, 10, 1, 11, 0, 0)) },
    });

    expect(screen.getByText(/non sia già passato|has not passed/)).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: /^Programma$|^Schedule$/,
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('opens on the moment already set, and takes it back when asked', async () => {
    const set = new Date(2026, 10, 3, 18, 15, 0);
    const { onCancelSchedule, onOpenChange } = renderDialog({
      scheduledPublishAt: set.toISOString(),
    });
    expect((field() as HTMLInputElement).value).toBe(fieldValue(set));

    fireEvent.click(
      screen.getByRole('button', {
        name: /Togli la programmazione|Remove the schedule/,
      }),
    );

    await waitFor(() => expect(onCancelSchedule).toHaveBeenCalled());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('does not offer to take back what was never set', () => {
    renderDialog();

    expect(
      screen.queryByRole('button', {
        name: /Togli la programmazione|Remove the schedule/,
      }),
    ).toBeNull();
  });

  it('says why the last attempt did not happen', () => {
    renderDialog({
      scheduledPublishAt: new Date(2026, 10, 3, 18, 15, 0).toISOString(),
      scheduleFailure: 'the search index did not answer',
    });

    expect(screen.getByText(/the search index did not answer/)).toBeTruthy();
  });

  it('stays open and says so when it could not be saved', async () => {
    const { onOpenChange } = renderDialog({
      onSchedule: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });
    fireEvent.change(field(), {
      target: { value: fieldValue(new Date(2026, 10, 2, 9, 30, 0)) },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /^Programma$|^Schedule$/ }),
    );

    expect(
      await screen.findByText(/non è stata programmata|was not scheduled/),
    ).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
