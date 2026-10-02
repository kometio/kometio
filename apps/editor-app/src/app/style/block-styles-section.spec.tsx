import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { BlockDescriptor } from '@kometio/block-registry';
import { buildSiteRecord } from '@kometio/testing/records';
import * as api from '../../lib/sites-api-client';
import { ApiError } from '../../lib/http-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { TooltipProvider } from '../../components/ui/tooltip';
import { BlockStylesSection } from './block-styles-section';
import { typeStylableProperties } from './block-styles-type-editor';

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: '', subtitle: '' },
  fields: [],
  stylableProperties: ['backgroundColor', 'textColor', 'borderRadius'],
};
const textDescriptor: BlockDescriptor = {
  type: 'Text',
  label: 'Testo',
  category: 'content',
  defaultProps: { body: '' },
  fields: [],
  // No stylableProperties: it must not appear in the list.
};
const registry = [heroDescriptor, textDescriptor];
const categories = [{ title: 'Contenuto', types: ['Hero', 'Text'] }];

vi.mock('../../lib/sites-api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/sites-api-client')>()),
  updateThemeTokens: vi.fn(),
}));

// No resolved defaults in these tests: without a mock the queries would
// make real network fetches.
vi.mock('../../lib/theme-api-client', () => ({
  fetchBlockStyleDefaults: vi.fn().mockResolvedValue({}),
  fetchThemeStyleProperties: vi.fn().mockResolvedValue({}),
  fetchThemeBaseTokens: vi.fn().mockResolvedValue({}),
}));

const site = buildSiteRecord();

function renderSection() {
  // Wrapped as main.tsx wraps the app: the breakpoint selector uses
  // IconButton, which needs a tooltip context.
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TooltipProvider>
        <BlockStylesSection
          site={site}
          registry={registry}
          categories={categories}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function openHero() {
  fireEvent.click(screen.getByText('Contenuto'));
  fireEvent.click(screen.getByText('Hero'));
}

describe('BlockStylesSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /*
   * `marginTop`/`marginBottom` mean nothing for a whole TYPE: the CSS for
   * them comes from `spacingRules`, which the per-instance builder calls
   * and the per-type builder does not (block-style-overrides.ts). Offered
   * here, they stored a value and rendered nothing — a control that looks
   * like it works.
   */
  it('never offers the two margins, which a type cannot set', () => {
    const withMargins: BlockDescriptor = {
      type: 'Card',
      label: 'blocks.card.label',
      category: 'layout',
      defaultProps: {},
      fields: [],
      stylableProperties: ['borderRadius', 'marginTop', 'marginBottom'],
    };

    expect(typeStylableProperties(withMargins)).toEqual(['borderRadius']);
  });

  it('lists only styleable block types, grouped by category', () => {
    renderSection();

    fireEvent.click(screen.getByText('Contenuto'));

    expect(screen.getByText('Hero')).toBeTruthy();
    expect(screen.queryByText('Testo')).toBeNull();
  });

  it('says it is applied at once, without saving', () => {
    renderSection();

    expect(screen.getByText(/Si applica subito, senza salvare/)).toBeTruthy();
  });

  it("opens one type's style, named, and saves a field change straight away", async () => {
    vi.mocked(api.updateThemeTokens).mockResolvedValue(site);
    renderSection();
    openHero();

    await screen.findByText('Raggio angoli');
    fireEvent.change(screen.getByPlaceholderText(/9999px/), {
      target: { value: '8px' },
    });

    await waitFor(() =>
      expect(api.updateThemeTokens).toHaveBeenCalledWith('site-1', {
        blockType: 'Hero',
        // The type's own look: this descriptor declares no variants, so
        // there is nothing else the panel could be painting.
        variant: 'default',
        style: expect.objectContaining({ base: { borderRadius: '8px' } }),
      }),
    );
    // Said, so a page that also has a Save bar is not read as unsaved.
    expect(await screen.findByText('Modifiche salvate.')).toBeTruthy();
  });

  it('says why a change was not saved, in words', async () => {
    vi.mocked(api.updateThemeTokens).mockRejectedValue(
      new ApiError(500, { message: 'Il tema non risponde' }),
    );
    renderSection();
    openHero();

    await screen.findByText('Raggio angoli');
    fireEvent.change(screen.getByPlaceholderText(/9999px/), {
      target: { value: '8px' },
    });

    expect(await screen.findByText('Il tema non risponde')).toBeTruthy();
    expect(screen.queryByText('Modifiche salvate.')).toBeNull();
  });

  it('goes back to the list from a type', async () => {
    renderSection();
    openHero();
    await screen.findByText('Raggio angoli');

    fireEvent.click(screen.getByRole('button', { name: /indietro/i }));

    expect(screen.getByText('Contenuto')).toBeTruthy();
  });

  // Enter in one of its fields is not "save the colours above it".
  it('does not let Enter in a field submit the form around it', async () => {
    const submitted = vi.fn((event: Event) => event.preventDefault());
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <TooltipProvider>
          <form onSubmit={(event) => submitted(event.nativeEvent)}>
            <BlockStylesSection
              site={site}
              registry={registry}
              categories={categories}
            />
            <button type="submit">Salva</button>
          </form>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    openHero();
    await screen.findByText('Raggio angoli');

    const field = screen.getByPlaceholderText(/9999px/);
    const notCancelled = fireEvent.keyDown(field, { key: 'Enter' });

    expect(notCancelled).toBe(false);
  });
});
