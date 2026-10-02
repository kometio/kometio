import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PageTranslationRecord } from '@kometio/api-contracts';
import { buildPageTranslationRecord } from '@kometio/testing/records';
import * as api from '../../lib/page-groups-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { PageGroupTranslationsDialog } from './page-group-translations-dialog';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';
import { ApiError } from '../../lib/http-client';

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise: what each role is offered is
// decided by the permissions table, and tested where it is decided.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

vi.mock('../../lib/page-groups-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/page-groups-api-client')>();
  return {
    ...actual,
    createPageGroupTranslation: vi.fn(),
    renamePageTranslation: vi.fn(),
  };
});

function translation(
  overrides: Partial<PageTranslationRecord> & { id: string; locale: string },
): PageTranslationRecord {
  return buildPageTranslationRecord({
    slug: 'chi-siamo',
    seoMeta: { title: 'Chi siamo', description: '' },
    status: 'published',
    ...overrides,
  });
}

function renderDialog(translations: PageTranslationRecord[]) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <WithToasts>
        <PageGroupTranslationsDialog
          groupId="group-1"
          parentGroupId={null}
          translations={translations}
          enabledLocales={['it', 'en']}
          activeLocale="it"
          onSelectLocale={() => undefined}
          open
          onOpenChange={() => undefined}
        />
      </WithToasts>
    </QueryClientProvider>,
  );
}

/*
 * A page's address used to be chosen once, at creation, from the title it
 * was born with — so a typo was its URL for good and the only way out was
 * deleting the page and losing its version history. This dialog is where
 * that stopped being true.
 */
describe('renaming a page from the translations dialog', () => {
  afterEach(() => vi.clearAllMocks());

  it('moves the page to the address that was typed', async () => {
    vi.mocked(api.renamePageTranslation).mockResolvedValue(
      translation({ id: 'tr-1', locale: 'it', slug: 'la-nostra-storia' }),
    );
    renderDialog([translation({ id: 'tr-1', locale: 'it' })]);

    const field = screen.getByLabelText('URL in IT');
    fireEvent.blur(field, { target: { value: 'la-nostra-storia' } });

    await waitFor(() =>
      expect(api.renamePageTranslation).toHaveBeenCalledWith(
        'tr-1',
        'la-nostra-storia',
        null,
      ),
    );
  });

  it('says the address was changed, since nothing else on screen does', async () => {
    vi.mocked(api.renamePageTranslation).mockResolvedValue(
      translation({ id: 'tr-1', locale: 'it', slug: 'la-nostra-storia' }),
    );
    renderDialog([translation({ id: 'tr-1', locale: 'it' })]);

    fireEvent.blur(screen.getByLabelText('URL in IT'), {
      target: { value: 'la-nostra-storia' },
    });

    expect(
      await screen.findByText(
        'Indirizzo della versione IT cambiato in la-nostra-storia',
      ),
    ).toBeTruthy();
  });

  it('slugifies what was typed rather than refusing it', async () => {
    vi.mocked(api.renamePageTranslation).mockResolvedValue(
      translation({ id: 'tr-1', locale: 'it', slug: 'la-nostra-storia' }),
    );
    renderDialog([translation({ id: 'tr-1', locale: 'it' })]);

    fireEvent.blur(screen.getByLabelText('URL in IT'), {
      target: { value: 'La Nostra Storia' },
    });

    await waitFor(() =>
      expect(api.renamePageTranslation).toHaveBeenCalledWith(
        'tr-1',
        'la-nostra-storia',
        null,
      ),
    );
  });

  it('asks for nothing when the address did not change', () => {
    renderDialog([translation({ id: 'tr-1', locale: 'it' })]);

    fireEvent.blur(screen.getByLabelText('URL in IT'), {
      target: { value: 'chi-siamo' },
    });

    expect(api.renamePageTranslation).not.toHaveBeenCalled();
  });

  /*
   * The database refuses a duplicate address, and the person who typed it
   * has to be told which one is taken — a field that silently snaps back
   * looks like a bug in the field.
   */
  it('says why, and restores the address, when the new one is taken', async () => {
    vi.mocked(api.renamePageTranslation).mockRejectedValue(
      new ApiError(409, { message: 'slug already exists', statusCode: 409 }),
    );
    renderDialog([translation({ id: 'tr-1', locale: 'it' })]);

    const field = screen.getByLabelText('URL in IT') as HTMLInputElement;
    fireEvent.blur(field, { target: { value: 'contatti' } });

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /slug already exists/,
    );
    expect(field.value).toBe('chi-siamo');
  });

  it('names the language each address belongs to', () => {
    renderDialog([
      translation({ id: 'tr-1', locale: 'it' }),
      translation({ id: 'tr-2', locale: 'en', slug: 'about-us' }),
    ]);

    expect(screen.getByLabelText('URL in IT')).toBeTruthy();
    expect(screen.getByLabelText('URL in EN')).toBeTruthy();
  });
});

describe('the translations dialog — what each role is offered (docs/roles.md)', () => {
  it('shows an editor the address without moving the page: a new address is live at once', () => {
    vi.mocked(useCurrentSession).mockReturnValue(sessionAs('editor'));
    renderDialog([translation({ id: 'tr-1', locale: 'it' })]);

    const field = screen.getByLabelText('URL in IT');
    expect(field.hasAttribute('readonly')).toBe(true);
    fireEvent.blur(field, { target: { value: 'la-nostra-storia' } });

    expect(api.renamePageTranslation).not.toHaveBeenCalled();
  });
});
