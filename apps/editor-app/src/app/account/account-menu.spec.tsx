import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import i18n from '../../i18n';
import { TooltipProvider } from '../../components/ui/tooltip';
import { chooseOption } from '../../test/select.test-fixture';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import * as accountApi from '../../lib/account-api-client';
import { ToastProvider } from '../shell/toast-provider';
import { AccountMenu } from './account-menu';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useNavigate: vi.fn(),
  };
});

vi.mock('../../lib/account-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/account-api-client')>();
  return {
    ...actual,
    getAccountProfile: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'chi@esempio.it',
      role: 'editor',
      displayName: 'Giulia Rossi',
      slug: 'giulia-rossi',
      bio: {},
      avatarUrl: null,
      language: null,
    }),
    changeAccountLanguage: vi.fn(),
  };
});

function renderMenu() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <ToastProvider>
          <AccountMenu />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function openMenu() {
  fireEvent.click(await screen.findByRole('button', { name: /^account:/i }));
}

describe('AccountMenu', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('kometio-theme');
  });

  afterEach(async () => {
    vi.mocked(accountApi.changeAccountLanguage).mockReset();
    // The tests run in Italian; a language change must not leak.
    await i18n.changeLanguage('it');
  });

  it("holds the person's profile and the way out, under their own preferences", async () => {
    renderMenu();
    await openMenu();

    const menu = await screen.findByRole('dialog', { name: 'Account' });
    expect(menu.textContent).toContain('chi@esempio.it');
    expect(screen.getByRole('link', { name: 'Il mio profilo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esci' })).toBeTruthy();
  });

  it('changes the language of the editor from a select, named in full', async () => {
    renderMenu();
    await openMenu();

    // A select rather than a switch: the label says what it is, and each
    // language is written in itself so it can be found from any other.
    const language = await screen.findByLabelText("Lingua dell'interfaccia");
    chooseOption(language, 'English');

    expect(i18n.language).toBe('en');
    expect(await screen.findByLabelText('Interface language')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the language chosen with the account, since the emails are written in it', async () => {
    vi.mocked(accountApi.changeAccountLanguage).mockResolvedValue({
      id: 'user-1',
      email: 'chi@esempio.it',
      role: 'editor',
      displayName: 'Giulia Rossi',
      slug: 'giulia-rossi',
      bio: {},
      avatarUrl: null,
      language: 'en',
    });
    renderMenu();
    await openMenu();

    chooseOption(
      await screen.findByLabelText("Lingua dell'interfaccia"),
      'English',
    );

    await waitFor(() =>
      expect(accountApi.changeAccountLanguage).toHaveBeenCalledWith('en'),
    );
    // The selector says what else the choice decides.
    expect(
      await screen.findByText(
        'It is also the language of the emails we send you.',
      ),
    ).toBeTruthy();
  });

  it('keeps the screen in the language chosen when saving it fails, and says the emails did not follow', async () => {
    vi.mocked(accountApi.changeAccountLanguage).mockRejectedValue(
      new Error('down'),
    );
    renderMenu();
    await openMenu();

    chooseOption(
      await screen.findByLabelText("Lingua dell'interfaccia"),
      'English',
    );

    expect(i18n.language).toBe('en');
    expect(
      await screen.findByText(
        'Language changed here, but not saved: your emails will keep arriving in the previous language.',
      ),
    ).toBeTruthy();
  });

  it('changes the theme with a choice of three, each with a name', async () => {
    renderMenu();
    await openMenu();

    const themes = await screen.findByRole('radiogroup', { name: 'Tema' });
    expect(
      Array.from(themes.querySelectorAll('[role="radio"]')).map((radio) =>
        radio.getAttribute('aria-label'),
      ),
    ).toEqual(['Chiaro', 'Scuro', 'Come il sistema']);

    fireEvent.click(screen.getByRole('radio', { name: 'Scuro' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('kometio-theme')).toBe('dark');
    expect(
      screen.getByRole('radio', { name: 'Scuro' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});
