import { createRef, type ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import type { BlockRect } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { BlockToolbarOverlay } from './block-toolbar-overlay';
import { TooltipProvider } from '../../components/ui/tooltip';

function renderOverlay(ui: ReactElement) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      {ui}
    </QueryClientProvider>,
    { wrapper: TooltipProvider },
  );
}

const RECT: BlockRect = {
  id: 'block-1',
  top: 100,
  left: 50,
  width: 300,
  height: 40,
};

function buildIframeRef() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  iframe.getBoundingClientRect = vi.fn(
    () => ({ top: 0, left: 0, width: 800, height: 600 }) as DOMRect,
  );
  const ref = createRef<HTMLIFrameElement>();
  ref.current = iframe;
  return ref;
}

const buttonDescriptor: BlockDescriptor = {
  type: 'Button',
  label: 'Bottone (CTA)',
  category: 'conversion',
  defaultProps: { label: 'Clicca qui' },
  fields: [],
  stylableProperties: ['backgroundColor', 'textColor', 'borderRadius'],
};

function baseProps() {
  return {
    iframeRef: buildIframeRef(),
    descriptor: buttonDescriptor,
    rect: RECT,
    isRootLevel: true,
    canMoveUp: false,
    canMoveDown: false,
    registry: [buttonDescriptor],
    categories: [],
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onInsertBefore: vi.fn(),
    onInsertAfter: vi.fn(),
  };
}

/*
 * The properties themselves moved to the right panel (see
 * properties-panel.spec.tsx), which is what the pencil used to open OVER
 * the canvas — covering the block being edited and the top bar with it.
 * What is left here is the toolbar's own job.
 */
describe('BlockToolbarOverlay properties button', () => {
  it('asks for the properties panel instead of opening one over the canvas', () => {
    const onFocusProperties = vi.fn();
    renderOverlay(
      <BlockToolbarOverlay
        {...baseProps()}
        onFocusProperties={onFocusProperties}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Proprietà' }));

    expect(onFocusProperties).toHaveBeenCalledTimes(1);
    // Nothing opened: the old popover is gone, and with it the field it
    // used to draw straight onto the canvas.
    expect(screen.queryByLabelText('Raggio angoli')).toBeNull();
  });
});

describe('BlockToolbarOverlay move buttons', () => {
  it('enables move up/down for a NESTED block when canMoveUp/canMoveDown are true (no longer gated by isRootLevel)', () => {
    renderOverlay(
      <BlockToolbarOverlay
        {...baseProps()}
        isRootLevel={false}
        canMoveUp={true}
        canMoveDown={true}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: 'Sposta su' })
        .hasAttribute('disabled'),
    ).toBe(false);
    expect(
      screen
        .getByRole('button', { name: 'Sposta giù' })
        .hasAttribute('disabled'),
    ).toBe(false);
  });

  it('disables move up/down when canMoveUp/canMoveDown are false, root-level or not', () => {
    renderOverlay(
      <BlockToolbarOverlay
        {...baseProps()}
        isRootLevel={true}
        canMoveUp={false}
        canMoveDown={false}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: 'Sposta su' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'Sposta giù' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it("calls onMoveUp/onMoveDown when a nested block's move buttons are clicked", () => {
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    renderOverlay(
      <BlockToolbarOverlay
        {...baseProps()}
        isRootLevel={false}
        canMoveUp={true}
        canMoveDown={true}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sposta su' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sposta giù' }));

    expect(onMoveUp).toHaveBeenCalledTimes(1);
    expect(onMoveDown).toHaveBeenCalledTimes(1);
  });
});

/*
 * A column of six unlabelled icons was a set of things to hover over to
 * learn what they did. The actions are written now; the rare one lives
 * under More.
 */
describe('BlockToolbarOverlay labels', () => {
  it('writes its main actions, and keeps "make reusable" under More', () => {
    const onMakeReusable = vi.fn();
    renderOverlay(
      <BlockToolbarOverlay
        {...baseProps()}
        onFocusProperties={vi.fn()}
        onMakeReusable={onMakeReusable}
      />,
    );

    for (const name of ['Proprietà', 'Duplica', 'Elimina', 'Altro']) {
      expect(screen.getByRole('button', { name }).textContent).toBe(name);
    }
    expect(
      screen.queryByRole('button', { name: 'Trasforma in sezione riusabile' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Altro' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Trasforma in sezione riusabile' }),
    );

    expect(onMakeReusable).toHaveBeenCalledTimes(1);
  });

  it('has no More menu when there is nothing rare to put in it', () => {
    renderOverlay(<BlockToolbarOverlay {...baseProps()} />);

    expect(screen.queryByRole('button', { name: 'Altro' })).toBeNull();
  });

  it('names the points where a block is added', () => {
    renderOverlay(<BlockToolbarOverlay {...baseProps()} />);

    expect(screen.getByRole('button', { name: 'Aggiungi sopra' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Aggiungi un blocco qui' }),
    ).toBeTruthy();
  });
});
