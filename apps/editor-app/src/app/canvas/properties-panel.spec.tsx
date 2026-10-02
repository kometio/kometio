import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Block } from '@kometio/shared-types';
import { buildSiteRecord } from '@kometio/testing/records';
import type { BlockDescriptor } from '@kometio/block-registry';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import * as siteApi from '../../lib/sites-api-client';
import * as themeApi from '../../lib/theme-api-client';
import { PropertiesPanel } from './properties-panel';

// No resolved defaults in these tests — they are not what these tests are
// about, and without a mock the query would make a real network fetch
// (non-deterministic behaviour). `useActiveThemeName` reads the site, and
// every theme-* query stays disabled while it is empty — so without this
// the capabilities query never runs and the panel falls back to "allowed",
// which is the very behaviour the last two tests here are checking.
vi.mock('../../lib/sites-api-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/sites-api-client')>();
  return { ...actual, getCurrentSite: vi.fn() };
});

// Every fetch the panel may start answers at once; none reaches a server.
vi.mock('../../lib/theme-api-client', () => ({
  fetchBlockStyleDefaults: vi.fn().mockResolvedValue({}),
  fetchThemeIcons: vi.fn().mockResolvedValue([]),
  fetchThemeCapabilities: vi.fn().mockResolvedValue({
    allowStyleOverrides: true,
  }),
  fetchThemeBaseTokens: vi.fn().mockResolvedValue({}),
  fetchThemeForegroundTokens: vi.fn().mockResolvedValue({}),
}));

function renderPanel(ui: ReactElement) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      {ui}
    </QueryClientProvider>,
  );
}

const buttonDescriptor: BlockDescriptor = {
  type: 'Button',
  label: 'Bottone (CTA)',
  category: 'conversion',
  defaultProps: { label: 'Clicca qui' },
  fields: [],
  stylableProperties: ['backgroundColor', 'textColor', 'borderRadius'],
};

const heroDescriptor: BlockDescriptor = {
  type: 'Hero',
  label: 'Hero',
  category: 'content',
  defaultProps: { title: 'Titolo' },
  fields: [],
};

function baseProps() {
  return {
    block: { id: 'block-1', type: 'Button', props: {} } as Block,
    descriptor: buttonDescriptor,
    isRootLevel: true,
    onChangeProp: vi.fn(),
    onChangeVariant: vi.fn(),
    onChangeInstanceStyle: vi.fn(),
    breakpoint: 'base' as const,
  };
}

/*
 * These used to live on BlockToolbarOverlay, behind a pencil that opened a
 * 416px popover over the canvas — it covered the block being edited and the
 * top bar with it. The controls are the same ones; where they sit is what
 * changed (they are a tab of the right panel now).
 */
describe('PropertiesPanel style fields', () => {
  it('still offers the instance style fields for a root-level block with no stylableProperties (marginTop/marginBottom are always offered there)', () => {
    renderPanel(
      <PropertiesPanel
        {...baseProps()}
        descriptor={heroDescriptor}
        isRootLevel={true}
      />,
    );

    expect(screen.getByLabelText('Spazio sotto')).toBeTruthy();
  });

  it('offers no instance style fields for a NESTED block with no stylableProperties (marginTop/marginBottom only apply to a page-root block)', () => {
    renderPanel(
      <PropertiesPanel
        {...baseProps()}
        descriptor={heroDescriptor}
        isRootLevel={false}
      />,
    );

    expect(screen.queryByLabelText('Spazio sotto')).toBeNull();
  });

  it('offers the instance style fields whenever the type has stylableProperties, regardless of typeStyle', () => {
    renderPanel(<PropertiesPanel {...baseProps()} />);

    expect(screen.getByLabelText('Raggio angoli')).toBeTruthy();
  });

  it('is pre-filled from block.styleOverride and calls onChangeInstanceStyle on edit', () => {
    const onChangeInstanceStyle = vi.fn();
    renderPanel(
      <PropertiesPanel
        {...baseProps()}
        block={
          {
            id: 'block-1',
            type: 'Button',
            props: {},
            styleOverride: { base: { borderRadius: '6px' } },
          } as Block
        }
        onChangeInstanceStyle={onChangeInstanceStyle}
      />,
    );

    expect(screen.getByLabelText('Raggio angoli')).toHaveProperty(
      'value',
      '6px',
    );

    fireEvent.change(screen.getByLabelText('Raggio angoli'), {
      target: { value: '9999px' },
    });

    expect(onChangeInstanceStyle).toHaveBeenCalledWith({
      borderRadius: '9999px',
    });
  });

  it('offers marginTop/marginBottom for a root-level block, and saves them via onChangeInstanceStyle', () => {
    const onChangeInstanceStyle = vi.fn();
    renderPanel(
      <PropertiesPanel
        {...baseProps()}
        isRootLevel={true}
        onChangeInstanceStyle={onChangeInstanceStyle}
      />,
    );

    fireEvent.change(screen.getByLabelText('Spazio sotto'), {
      target: { value: '2rem' },
    });

    expect(onChangeInstanceStyle).toHaveBeenCalledWith({
      marginBottom: '2rem',
    });
  });

  it('does not offer marginTop/marginBottom for a NESTED block, even when the type has other stylableProperties', () => {
    renderPanel(<PropertiesPanel {...baseProps()} isRootLevel={false} />);

    expect(screen.queryByLabelText('Spazio sopra')).toBeNull();
    expect(screen.queryByLabelText('Spazio sotto')).toBeNull();
  });

  /*
   * The panel is always on screen now, which means it has to answer for
   * "nothing is selected" too — a tab that vanishes and comes back is a tab
   * nobody can aim at.
   */
  it('says what to do when nothing is selected, rather than rendering nothing', () => {
    renderPanel(
      <PropertiesPanel {...baseProps()} block={null} descriptor={null} />,
    );

    expect(screen.getByText(/Seleziona un blocco/)).toBeTruthy();
  });
});

/**
 * A theme may refuse to be dressed at all (`allowStyleOverrides: false` in
 * its theme.json, docs/adr/0021). Until the editor could read that, the
 * styling controls appeared on such a site, saved what you chose, and the
 * published page ignored it — with nothing anywhere saying why.
 */
describe('PropertiesPanel under a theme that refuses styling', () => {
  const withFields: BlockDescriptor = {
    ...buttonDescriptor,
    fields: [{ kind: 'text', key: 'label', label: 'Testo' }],
  };

  beforeEach(() => {
    vi.mocked(siteApi.getCurrentSite).mockResolvedValue(
      buildSiteRecord({ themeName: 'locked-theme' }),
    );
    vi.mocked(themeApi.fetchThemeCapabilities).mockResolvedValue({
      allowStyleOverrides: false,
    });
  });

  it('offers no styling for this block', async () => {
    renderPanel(
      <PropertiesPanel
        {...baseProps()}
        descriptor={withFields}
        isRootLevel={true}
        typeStyle={{ base: {} }}
      />,
    );

    // Waited for rather than asserted once: the panel renders before the
    // capabilities answer arrives, so a single `queryBy` would pass
    // whatever the answer turned out to be — it would be checking that
    // React has not finished, not that the theme was obeyed.
    await waitFor(() => {
      expect(screen.queryByLabelText('Raggio angoli')).toBeNull();
      expect(screen.queryByLabelText('Spazio sotto')).toBeNull();
    });
    // Still there, so those went away because the theme said so and not
    // because the panel failed to render at all.
    expect(screen.getByLabelText('Testo')).toBeTruthy();
  });
});
