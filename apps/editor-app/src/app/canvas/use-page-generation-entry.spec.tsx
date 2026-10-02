import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageBlocks } from '@kometio/block-registry';
import * as api from '../../lib/page-generation-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { ToastProvider } from '../shell/toast-provider';
import { useCurrentSession } from '../auth/use-current-session';
import { sessionAs } from '../../test/current-session.test-fixture';
import {
  usePageGenerationEntry,
  type PageGenerationConfig,
} from './use-page-generation-entry';
import type { IdentifiedBlock } from './use-block-tree';
import { TooltipProvider } from '../../components/ui/tooltip';

vi.mock('../../lib/page-generation-api-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../lib/page-generation-api-client')
  >()),
  getPageGenerationStatus: vi.fn(),
  generatePage: vi.fn(),
}));

vi.mock('../auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));

// An admin unless a test says otherwise.
beforeEach(() => {
  vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
});

const config: PageGenerationConfig = { siteId: 'site-1', locale: 'it' };

const generated = {
  content: [
    {
      id: 'g',
      type: 'FeatureGrid',
      props: {},
      children: [
        { id: 'f1', type: 'Feature', props: { icon: 'wheat', title: 'A' } },
        { id: 'f2', type: 'Feature', props: { icon: 'globe', title: 'B' } },
      ],
    },
    { id: 't1', type: 'Hero', props: { title: 'Pane' } },
  ],
  droppedCount: 0,
  placeholderCount: 2,
};

interface HarnessProps {
  config: PageGenerationConfig | undefined;
  canvasReady?: boolean;
  onAppend?: (blocks: IdentifiedBlock[]) => void;
  onReplace?: (blocks: IdentifiedBlock[]) => void;
}

function Harness({
  config: harnessConfig,
  canvasReady = true,
  onAppend = vi.fn(),
  onReplace = vi.fn(),
}: HarnessProps) {
  const generation = usePageGenerationEntry({
    config: harnessConfig,
    blocks: [],
    registry: pageBlocks,
    // The active theme draws globe, not wheat.
    isMissingFromTheme: (name) => name !== 'globe',
    canvasReady,
    onAppend,
    onReplace,
  });
  return (
    <>
      {generation.offered && (
        <button type="button" onClick={generation.openDialog}>
          open
        </button>
      )}
      {generation.dialog}
    </>
  );
}

function renderHarness(props: HarnessProps) {
  const client = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness {...props} />
      </ToastProvider>
    </QueryClientProvider>,
    { wrapper: TooltipProvider },
  );
  return {
    rerender: (next: HarnessProps) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <Harness {...next} />
          </ToastProvider>
        </QueryClientProvider>,
      ),
  };
}

describe('usePageGenerationEntry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('offers nothing on a server that cannot keep a key', async () => {
    vi.mocked(api.getPageGenerationStatus).mockResolvedValue({
      availability: 'server-disabled',
    });
    renderHarness({ config });

    await waitFor(() => expect(api.getPageGenerationStatus).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'open' })).toBeNull();
  });

  it('puts the page in without the icons the theme lacks, and says what is left to fill in', async () => {
    vi.mocked(api.getPageGenerationStatus).mockResolvedValue({
      availability: 'ready',
    });
    vi.mocked(api.generatePage).mockResolvedValue(generated);
    const onReplace = vi.fn();
    renderHarness({ config, onReplace });

    fireEvent.click(await screen.findByRole('button', { name: 'open' }));
    fireEvent.change(screen.getByLabelText('Cosa deve dire la pagina?'), {
      target: { value: 'La home di un forno' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Genera' }));

    await waitFor(() => expect(onReplace).toHaveBeenCalledTimes(1));
    const [placed] = onReplace.mock.calls[0];
    expect(
      placed[0].children.map((block: IdentifiedBlock) => block.props),
    ).toEqual([{ title: 'A' }, { icon: 'globe', title: 'B' }]);
    // Four: the grid, its two features and the hero, not the two at the top.
    await screen.findByText(
      '4 blocchi aggiunti alla pagina. 2 hanno ancora un segnaposto da sostituire: li segnala Livelli.',
    );
  });

  it('says how many blocks it had to leave out', async () => {
    vi.mocked(api.getPageGenerationStatus).mockResolvedValue({
      availability: 'ready',
    });
    vi.mocked(api.generatePage).mockResolvedValue({
      ...generated,
      droppedCount: 3,
      placeholderCount: 0,
    });
    renderHarness({ config });

    fireEvent.click(await screen.findByRole('button', { name: 'open' }));
    fireEvent.change(screen.getByLabelText('Cosa deve dire la pagina?'), {
      target: { value: 'La home di un forno' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Genera' }));

    await screen.findByText(
      '4 blocchi aggiunti alla pagina. 3 blocchi non erano utilizzabili e sono stati lasciati fuori.',
    );
  });

  it('starts a prompt from the New page dialog only once the canvas can take the page', async () => {
    vi.mocked(api.getPageGenerationStatus).mockResolvedValue({
      availability: 'ready',
    });
    vi.mocked(api.generatePage).mockResolvedValue(generated);
    const onReplace = vi.fn();
    const withPrompt = { ...config, initialPrompt: 'Chi siamo' };
    const { rerender } = renderHarness({
      config: withPrompt,
      canvasReady: false,
      onReplace,
    });

    await screen.findByRole('button', { name: 'open' });
    expect(api.generatePage).not.toHaveBeenCalled();

    rerender({ config: withPrompt, canvasReady: true, onReplace });
    await waitFor(() => expect(onReplace).toHaveBeenCalledTimes(1));
    expect(api.generatePage).toHaveBeenCalledTimes(1);
  });

  it('never starts one on a linked translation: it explains instead', async () => {
    vi.mocked(api.getPageGenerationStatus).mockResolvedValue({
      availability: 'ready',
    });
    renderHarness({
      config: {
        ...config,
        blockedBy: 'linked-translation',
        initialPrompt: 'Chi siamo',
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'open' }));
    await screen.findByText(/condivide i blocchi con la pagina originale/);
    expect(api.generatePage).not.toHaveBeenCalled();
  });
});
