import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSession } from '@kometio/api-contracts';
import * as api from '../../lib/account-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { SessionsSection } from './sessions-section';

vi.mock('../../lib/account-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/account-api-client')>();
  return {
    ...actual,
    getAccountSessions: vi.fn(),
    endAccountSession: vi.fn(),
    endOtherAccountSessions: vi.fn(),
  };
});

const NOW = new Date('2026-10-14T12:00:00Z');

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    id: 'session-1',
    deviceLabel: 'Chrome on macOS',
    createdAt: '2026-10-01T09:00:00Z',
    lastUsedAt: '2026-10-14T11:59:00Z',
    isCurrent: true,
    ...overrides,
  };
}

function renderSection() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <SessionsSection />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('SessionsSection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('names each device by what it is, says which is this one, and offers no button for it', async () => {
    vi.mocked(api.getAccountSessions).mockResolvedValue([
      session(),
      session({
        id: 'session-2',
        deviceLabel: 'Safari on iPhone',
        isCurrent: false,
        lastUsedAt: '2026-10-12T08:00:00Z',
      }),
    ]);

    renderSection();

    expect(await screen.findByText('Chrome on macOS')).toBeTruthy();
    expect(screen.getByText('Questo dispositivo')).toBeTruthy();
    const phone = screen.getByText('Safari on iPhone').closest('li');
    expect(phone).not.toBeNull();
    expect(
      within(phone as HTMLElement).getByRole('button', {
        name: 'Scollega Safari on iPhone',
      }),
    ).toBeTruthy();
    // This device: no way to end it from its own list.
    const here = screen.getByText('Chrome on macOS').closest('li');
    expect(within(here as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('says a device used a minute ago is active now, and one used days ago when it was', async () => {
    vi.mocked(api.getAccountSessions).mockResolvedValue([
      session(),
      session({
        id: 'session-2',
        deviceLabel: 'Firefox on Windows',
        isCurrent: false,
        lastUsedAt: '2026-10-12T08:00:00Z',
      }),
    ]);

    renderSection();

    expect(await screen.findByText(/Attivo adesso/)).toBeTruthy();
    expect(screen.getByText(/Ultimo uso/)).toBeTruthy();
  });

  it('calls a device the server could not recognise an unknown one, and does not make up a name', async () => {
    vi.mocked(api.getAccountSessions).mockResolvedValue([
      session({ id: 'session-2', deviceLabel: null, isCurrent: false }),
    ]);

    renderSection();

    expect(await screen.findByText('Dispositivo sconosciuto')).toBeTruthy();
  });

  it('signs out one device and says which, then shows what is left', async () => {
    vi.mocked(api.getAccountSessions)
      .mockResolvedValueOnce([
        session(),
        session({
          id: 'session-2',
          deviceLabel: 'Safari on iPhone',
          isCurrent: false,
        }),
      ])
      .mockResolvedValue([session()]);
    vi.mocked(api.endAccountSession).mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Scollega Safari on iPhone' }),
    );

    await waitFor(() =>
      expect(api.endAccountSession).toHaveBeenCalledWith('session-2'),
    );
    expect(await screen.findByText('Safari on iPhone scollegato')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Scollega Safari/ }),
      ).toBeNull(),
    );
  });

  it('asks before signing out everywhere else, and only offers it when there is more than one other device', async () => {
    vi.mocked(api.getAccountSessions).mockResolvedValueOnce([
      session(),
      session({ id: 'session-2', isCurrent: false, deviceLabel: 'A' }),
    ]);
    const { unmount } = renderSection();
    await screen.findByText('A');
    expect(
      screen.queryByRole('button', {
        name: 'Scollega tutti gli altri dispositivi',
      }),
    ).toBeNull();
    unmount();

    vi.mocked(api.getAccountSessions).mockResolvedValue([
      session(),
      session({ id: 'session-2', isCurrent: false, deviceLabel: 'A' }),
      session({ id: 'session-3', isCurrent: false, deviceLabel: 'B' }),
    ]);
    vi.mocked(api.endOtherAccountSessions).mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Scollega tutti gli altri dispositivi',
      }),
    );
    const dialog = screen.getByRole('alertdialog');
    expect(api.endOtherAccountSessions).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Scollega tutti gli altri dispositivi',
      }),
    );

    await waitFor(() =>
      expect(api.endOtherAccountSessions).toHaveBeenCalledTimes(1),
    );
  });

  it('says it could not sign out when the server refuses, and keeps the list', async () => {
    vi.mocked(api.getAccountSessions).mockResolvedValue([
      session(),
      session({
        id: 'session-2',
        deviceLabel: 'Safari on iPhone',
        isCurrent: false,
      }),
    ]);
    vi.mocked(api.endAccountSession).mockRejectedValue(new Error('boom'));
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Scollega Safari on iPhone' }),
    );

    expect(
      await screen.findByText('Non è stato possibile scollegare. Riprova.'),
    ).toBeTruthy();
    expect(screen.getByText('Safari on iPhone')).toBeTruthy();
  });
});
