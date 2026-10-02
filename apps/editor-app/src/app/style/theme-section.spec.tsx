import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { ApiError } from '../../lib/http-client';
import { availableThemesQueryOptions } from '../settings/site-queries';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { WithToasts } from '../../test/toasts.test-fixture';
import { ThemeSection } from './theme-section';

// The upload panel asks whether uploads are on; these tests are about the
// rest (theme-upload-panel.spec.tsx).
vi.mock('../../lib/theme-uploads-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/theme-uploads-api-client')
  >()),
  getThemeUploadSettings: vi.fn().mockResolvedValue({ enabled: false }),
}));

vi.mock('../../lib/sites-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/sites-api-client')>()),
  updateThemePackage: vi.fn(),
  listAvailableThemes: vi.fn().mockResolvedValue([
    { name: 'classic', uploaded: false },
    { name: 'docs-showcase', uploaded: false },
  ]),
}));

function renderSection(themeName = 'classic') {
  const queryClient = createTestQueryClient();
  // Already there, so the list is open the moment the menu is.
  queryClient.setQueryData(availableThemesQueryOptions().queryKey, [
    { name: 'classic', uploaded: false },
    { name: 'docs-showcase', uploaded: false },
  ]);
  return render(
    <QueryClientProvider client={queryClient}>
      <WithToasts>
        <ThemeSection site={buildSiteRecord({ themeName })} />
      </WithToasts>
    </QueryClientProvider>,
  );
}

describe('ThemeSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks the site's current theme as selected", async () => {
    renderSection('docs-showcase');

    fireEvent.click(await screen.findByRole('combobox', { name: 'Tema' }));

    expect(
      screen.getByRole('option', { name: 'docs-showcase', selected: true }),
    ).toBeTruthy();
  });

  it('switches theme on selection, and says it did', async () => {
    vi.mocked(api.updateThemePackage).mockResolvedValue(
      buildSiteRecord({ themeName: 'docs-showcase' }),
    );
    renderSection();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Tema' }));
    fireEvent.click(screen.getByRole('option', { name: 'docs-showcase' }));

    await waitFor(() =>
      expect(api.updateThemePackage).toHaveBeenCalledWith('site-1', {
        themeName: 'docs-showcase',
      }),
    );
    expect(
      await screen.findByText('Tema cambiato in «docs-showcase»'),
    ).toBeTruthy();
  });

  it('says why a theme could not be applied', async () => {
    vi.mocked(api.updateThemePackage).mockRejectedValue(
      new ApiError(400, { message: 'Il tema non esiste più' }),
    );
    renderSection();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Tema' }));
    fireEvent.click(screen.getByRole('option', { name: 'docs-showcase' }));

    expect(await screen.findByText('Il tema non esiste più')).toBeTruthy();
  });
});
