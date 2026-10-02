import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { ToastProvider } from '../shell/toast-provider';
import { FormSubmissionRetentionSection } from './form-submission-retention-section';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useBlocker: () => ({ status: 'idle' as const }) };
});

vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return {
    ...actual,
    updateFormSubmissionRetention: vi.fn(),
    countSubmissionsOlderThan: vi.fn(),
  };
});

function renderSection(days: number | null) {
  const site = buildSiteRecord({ formSubmissionRetentionDays: days });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <FormSubmissionRetentionSection site={site} />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return site;
}

const forever = () =>
  screen.getByRole('radio', { name: 'Conserva le risposte per sempre' });
const afterDays = () =>
  screen.getByRole('radio', {
    name: 'Elimina le risposte dopo un numero di giorni',
  });
const daysField = () =>
  screen.getByLabelText('Numero di giorni') as HTMLInputElement;
const save = () => screen.findByRole('button', { name: 'Salva' });

describe('FormSubmissionRetentionSection', () => {
  beforeEach(() => {
    vi.mocked(api.countSubmissionsOlderThan).mockResolvedValue(3);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows "for ever" when nothing is set, and the number when there is one', () => {
    renderSection(null);
    expect(forever().getAttribute('aria-checked')).toBe('true');
    expect(afterDays().getAttribute('aria-checked')).toBe('false');
  });

  it('starts on the number of days the site has', () => {
    renderSection(30);

    expect(afterDays().getAttribute('aria-checked')).toBe('true');
    expect(daysField().value).toBe('30');
    expect(screen.getByText('giorni')).toBeTruthy();
  });

  it('takes typing a number for choosing "after N days"', () => {
    renderSection(null);

    fireEvent.change(daysField(), { target: { value: '90' } });

    expect(afterDays().getAttribute('aria-checked')).toBe('true');
    expect(forever().getAttribute('aria-checked')).toBe('false');
  });

  it('says what is missing, under the field and with the focus on it, when "after N days" has no N', async () => {
    renderSection(null);

    fireEvent.click(afterDays());
    fireEvent.click(await save());

    const error = await screen.findByRole('alert');
    expect(error.textContent).toMatch(/numero intero di giorni/);
    await waitFor(() => expect(document.activeElement).toBe(daysField()));
    expect(api.updateFormSubmissionRetention).not.toHaveBeenCalled();
  });

  it('refuses a number of days that is not whole, under the field, and sends nothing', async () => {
    renderSection(30);

    fireEvent.change(daysField(), { target: { value: '2.5' } });
    fireEvent.click(await save());

    const error = await screen.findByRole('alert');
    expect(error.textContent).toMatch(/numero intero di giorni/);
    expect(daysField().getAttribute('aria-invalid')).toBe('true');
    expect(daysField().getAttribute('aria-describedby')).toContain(error.id);
    expect(api.updateFormSubmissionRetention).not.toHaveBeenCalled();
  });

  it('keeps every answer when "for ever" is chosen — asking nothing, since nothing is deleted', async () => {
    const site = renderSection(30);
    vi.mocked(api.updateFormSubmissionRetention).mockResolvedValue({
      ...site,
      formSubmissionRetentionDays: null,
    });

    fireEvent.click(forever());
    fireEvent.click(await save());

    await waitFor(() =>
      expect(api.updateFormSubmissionRetention).toHaveBeenCalledWith(site.id, {
        formSubmissionRetentionDays: null,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before deleting sooner than it did, and says what goes and when', async () => {
    const site = renderSection(90);
    vi.mocked(api.updateFormSubmissionRetention).mockResolvedValue({
      ...site,
      formSubmissionRetentionDays: 30,
    });

    fireEvent.change(daysField(), { target: { value: '30' } });
    fireEvent.click(await save());

    const dialog = await screen.findByRole('alertdialog');
    // The number, from the server, and not "some".
    expect(api.countSubmissionsOlderThan).toHaveBeenCalledWith(site.id, 30);
    expect(dialog.textContent).toContain('3 risposte più vecchie di 30 giorni');
    expect(dialog.textContent).toContain('per sempre');
    expect(dialog.textContent).toContain('pulizia notturna');
    expect(api.updateFormSubmissionRetention).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Elimina le risposte vecchie' }),
    );

    await waitFor(() =>
      expect(api.updateFormSubmissionRetention).toHaveBeenCalledWith(site.id, {
        formSubmissionRetentionDays: 30,
      }),
    );
  });

  it('asks when going from "for ever" to a number, since that deletes what is older', async () => {
    renderSection(null);

    fireEvent.change(daysField(), { target: { value: '365' } });
    fireEvent.click(await save());

    expect((await screen.findByRole('alertdialog')).textContent).toContain(
      'più vecchie di 365 giorni',
    );
  });

  it('asks nothing when the time is made longer', async () => {
    const site = renderSection(30);
    vi.mocked(api.updateFormSubmissionRetention).mockResolvedValue({
      ...site,
      formSubmissionRetentionDays: 90,
    });

    fireEvent.change(daysField(), { target: { value: '90' } });
    fireEvent.click(await save());

    await waitFor(() =>
      expect(api.updateFormSubmissionRetention).toHaveBeenCalledWith(site.id, {
        formSubmissionRetentionDays: 90,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('leaves everything as it was when the question is answered No', async () => {
    renderSection(90);

    fireEvent.change(daysField(), { target: { value: '7' } });
    fireEvent.click(await save());
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.updateFormSubmissionRetention).not.toHaveBeenCalled();
    expect(daysField().value).toBe('7');
  });

  it('says one answer in the singular', async () => {
    vi.mocked(api.countSubmissionsOlderThan).mockResolvedValue(1);
    renderSection(90);

    fireEvent.change(daysField(), { target: { value: '30' } });
    fireEvent.click(await save());

    expect((await screen.findByRole('alertdialog')).textContent).toContain(
      '1 risposta più vecchia di 30 giorni verrà eliminata',
    );
  });

  // Nothing is that old yet, so nothing goes tonight: no question to ask.
  it('asks nothing when no answer is older than the new time, and saves', async () => {
    vi.mocked(api.countSubmissionsOlderThan).mockResolvedValue(0);
    const site = renderSection(90);
    vi.mocked(api.updateFormSubmissionRetention).mockResolvedValue({
      ...site,
      formSubmissionRetentionDays: 30,
    });

    fireEvent.change(daysField(), { target: { value: '30' } });
    fireEvent.click(await save());

    await waitFor(() =>
      expect(api.updateFormSubmissionRetention).toHaveBeenCalledWith(site.id, {
        formSubmissionRetentionDays: 30,
      }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks in words without a number when it could not be counted, rather than not asking', async () => {
    vi.mocked(api.countSubmissionsOlderThan).mockRejectedValue(
      new Error('offline'),
    );
    renderSection(90);

    fireEvent.change(daysField(), { target: { value: '30' } });
    fireEvent.click(await save());

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('più vecchie di 30 giorni');
    expect(dialog.textContent).not.toMatch(/\d+ risposte più vecchie/);
  });

  it('does not ask the server when the time is made longer, or none', async () => {
    const site = renderSection(30);
    vi.mocked(api.updateFormSubmissionRetention).mockResolvedValue({
      ...site,
      formSubmissionRetentionDays: 90,
    });

    fireEvent.change(daysField(), { target: { value: '90' } });
    fireEvent.click(await save());

    await waitFor(() =>
      expect(api.updateFormSubmissionRetention).toHaveBeenCalled(),
    );
    expect(api.countSubmissionsOlderThan).not.toHaveBeenCalled();
  });
});
