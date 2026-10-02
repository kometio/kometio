import type { ReactElement } from 'react';
import {
  fireEvent,
  render as renderUnwrapped,
  screen,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Block } from '@kometio/shared-types';
import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { LayersPanel } from './layers-panel';
import { TooltipProvider } from '../../components/ui/tooltip';
import { LayerContextMenu } from './layer-context-menu';

// What the shell passes, minus a theme: core's own descriptors by type.
const CORE_BY_TYPE = new Map(
  [...pageBlocks, ...headerFooterBlocks].map((block) => [block.type, block]),
);
const describeCore = (type: string) => CORE_BY_TYPE.get(type);

// Its toggles and handles are IconButtons, which show a tooltip.
const render = (ui: ReactElement) =>
  renderUnwrapped(ui, { wrapper: TooltipProvider });

describe('LayersPanel', () => {
  it('renders nothing for an empty page', () => {
    const { container } = render(
      <LayersPanel
        describeType={describeCore}
        blocks={[]}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  /*
   * By the name a person picked the block by, not by its type. The tree
   * used to read `FeatureGrid` and `EmbedHtml` — our words for it, in a
   * panel meant for somebody arranging a page. Every block already had a
   * translated label; the panel simply was not asking for it.
   */
  /*
   * The keyboard drag used to live on a wrapper around each list item:
   * the list held "buttons" instead of items, and those buttons held the
   * row's own buttons inside them (axe: list, listitem,
   * nested-interactive). The item moves now, and a handle carries the
   * keyboard drag.
   */
  it('keeps the tree a list of items, with a named handle to drag each by keyboard', () => {
    const blocks: Block[] = [
      {
        id: 'columns-1',
        type: 'Columns',
        props: {},
        children: [{ id: 'text-1', type: 'Text', props: {} }],
      },
    ];
    const { container } = render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    for (const list of container.querySelectorAll('ul')) {
      for (const child of list.children) {
        expect(child.tagName).toBe('LI');
      }
    }
    expect(container.querySelector('li[role="button"]')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Trascina "Testo"' })
        .getAttribute('aria-roledescription'),
    ).toBe('sortable');
  });

  it('renders one row per top-level block, named the way a person picked it', () => {
    const blocks: Block[] = [
      { id: 'hero-1', type: 'Hero', props: {} },
      { id: 'text-1', type: 'Text', props: {} },
    ];
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId('layer-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toBe('Hero');
    expect(rows[1].textContent).toBe('Testo');
  });

  it('renders nested children indented under their container', () => {
    const blocks: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [{ id: 'text-1', type: 'Text', props: {} }],
      },
    ];
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId('layer-row');
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toBe('Testo');
  });

  /*
   * Indentation alone stopped being readable at the third level:
   * `Columns > Column > Code` was three rows at three margins, and which
   * Column the Code belonged to was a guess. The guides answer that
   * without being read — and the line under the LAST child has to stop
   * at its elbow, or the tree draws a branch continuing past its end.
   */
  /*
   * Right-clicking a row selects it first, and NOT additively: the menu
   * acts on the selection, so deleting from one row must not take
   * whatever happened to be selected before it as well.
   */
  it('selects the row it was opened on, on its own, before offering a menu', async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={[
          { id: 'hero-1', type: 'Hero', props: {} },
          { id: 'text-1', type: 'Text', props: {} },
        ]}
        hoveredBlockId={null}
        selectedBlockId="hero-1"
        onSelect={onSelect}
        contextMenu={
          <LayerContextMenu
            canMoveUp
            canMoveDown={false}
            onDuplicate={vi.fn()}
            onDelete={onDelete}
            onMoveUp={vi.fn()}
            onMoveDown={vi.fn()}
          />
        }
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Testo' }), {
      clientX: 120,
      clientY: 240,
    });

    expect(onSelect).toHaveBeenCalledWith('text-1', false);
    const menu = await screen.findByRole('menu');
    expect(
      screen
        .getByRole('menuitem', { name: 'Sposta giù' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rimuovi blocco' }));
    expect(onDelete).toHaveBeenCalled();
    expect(menu.isConnected).toBe(false);
  });

  it('draws a guide for every branch a row sits under, and ends the one it closes', () => {
    const blocks: Block[] = [
      {
        id: 'columns-1',
        type: 'Columns',
        props: {},
        children: [
          { id: 'col-1', type: 'Column', props: {} },
          { id: 'col-2', type: 'Column', props: {} },
        ],
      },
    ];
    const { container } = render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    const items = [...container.querySelectorAll('li')];
    const guides = (li: Element) =>
      [...li.children].filter(
        (child) =>
          child.tagName === 'SPAN' && child.hasAttribute('aria-hidden'),
      );

    const [root, firstChild, lastChild] = items;
    if (!root || !firstChild || !lastChild) {
      throw new Error('expected a container and its two children');
    }
    // The container is at the root: nothing above it to connect to.
    expect(guides(root)).toHaveLength(0);
    // Each child gets its branch line plus the elbow into it.
    expect(guides(firstChild)).toHaveLength(2);
    expect(guides(lastChild)).toHaveLength(2);
    // ...and the last child's line stops halfway, at the elbow.
    const [lastBranchLine] = guides(lastChild);
    if (!(lastBranchLine instanceof HTMLElement)) {
      throw new Error('expected the branch line to be drawn');
    }
    expect(lastBranchLine.style.height).not.toBe('');
  });

  it('marks the hovered row distinctly from an idle one', () => {
    const blocks: Block[] = [{ id: 'hero-1', type: 'Hero', props: {} }];
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId="hero-1"
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('layer-row').getAttribute('data-state')).toBe(
      'hovered',
    );
  });

  it('still renders every row (non-orderable) when a block is missing an id', () => {
    const blocks: Block[] = [
      { type: 'Hero', props: {} },
      { id: 'text-1', type: 'Text', props: {} },
    ];
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('layer-row')).toHaveLength(2);
  });

  it('marks the selected row distinctly from a merely hovered one', () => {
    const blocks: Block[] = [{ id: 'hero-1', type: 'Hero', props: {} }];
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId="hero-1"
        selectedBlockId="hero-1"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('layer-row').getAttribute('data-state')).toBe(
      'selected',
    );
  });

  it('clicking a top-level row selects that block — the reliable way to select a container fully covered by a child on the canvas', () => {
    const blocks: Block[] = [
      { id: 'hero-1', type: 'Hero', props: {} },
      { id: 'text-1', type: 'Text', props: {} },
    ];
    const onSelect = vi.fn();
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getAllByTestId('layer-row')[1]);

    expect(onSelect).toHaveBeenCalledWith('text-1', false);
  });

  it('clicking a nested row selects the CHILD, not its parent container', () => {
    const blocks: Block[] = [
      {
        id: 'column-1',
        type: 'Column',
        props: {},
        children: [{ id: 'gallery-1', type: 'Gallery', props: {} }],
      },
    ];
    const onSelect = vi.fn();
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={onSelect}
      />,
    );

    const rows = screen.getAllByTestId('layer-row');
    fireEvent.click(rows[0]); // "column-1"
    expect(onSelect).toHaveBeenLastCalledWith('column-1', false);

    fireEvent.click(rows[1]); // "gallery-1"
    expect(onSelect).toHaveBeenLastCalledWith('gallery-1', false);
  });

  it('a container with children shows an expand/collapse chevron, a leaf block does not', () => {
    const blocks: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [{ id: 'text-1', type: 'Text', props: {} }],
      },
      { id: 'hero-1', type: 'Hero', props: {} },
    ];
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Comprimi' })).toHaveLength(1);
  });

  it('collapsing a container hides its nested rows without affecting selection', () => {
    const blocks: Block[] = [
      {
        id: 'container-1',
        type: 'Container',
        props: {},
        children: [{ id: 'text-1', type: 'Text', props: {} }],
      },
    ];
    const onSelect = vi.fn();
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={onSelect}
      />,
    );

    expect(screen.getAllByTestId('layer-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Comprimi' }));
    expect(screen.getAllByTestId('layer-row')).toHaveLength(1);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Espandi' }));
    expect(screen.getAllByTestId('layer-row')).toHaveLength(2);
  });

  it('a row for a block with no id is disabled and never calls onSelect', () => {
    const blocks: Block[] = [{ type: 'Hero', props: {} }];
    const onSelect = vi.fn();
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={blocks}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={onSelect}
      />,
    );

    const row = screen.getByTestId('layer-row');
    expect(row).toHaveProperty('disabled', true);
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  /*
   * A theme with its own icon set draws nothing for a name it lacks
   * (ADR-0023's binary rule), and nothing on the canvas says why — an Icon
   * block with a missing icon looks exactly like one with none chosen
   * (ADR-0090).
   */
  it('marks the row of a block whose icon the theme does not have, and only that one', () => {
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={[
          { id: 'feature-1', type: 'Feature', props: {} },
          { id: 'feature-2', type: 'Feature', props: {} },
        ]}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
        missingIcons={new Map([['feature-1', ['palette', 'puzzle']]])}
      />,
    );

    const [marked, clean] = screen.getAllByTestId('layer-row');
    // Part of the row's name, so a screen reader hears it on the row.
    expect(marked?.textContent).toContain(
      'Assente nel tema, quindi non si vede sul sito: palette, puzzle',
    );
    expect(clean?.textContent).not.toContain('Assente nel tema');
  });

  it("names a theme's block by the description it is given, not by its type", () => {
    render(
      <LayersPanel
        describeType={(type) =>
          type === 'StatusBadge'
            ? { label: 'Etichetta di stato', icon: 'badge' }
            : describeCore(type)
        }
        blocks={[{ id: 'badge-1', type: 'StatusBadge', props: {} }]}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('layer-row').textContent).toBe(
      'Etichetta di stato',
    );
    expect(
      screen.getByRole('button', { name: 'Trascina "Etichetta di stato"' }),
    ).toBeTruthy();
  });

  it('a collapsed container says it holds one, so a hidden row is not a silent one', () => {
    render(
      <LayersPanel
        describeType={describeCore}
        blocks={[
          {
            id: 'grid-1',
            type: 'FeatureGrid',
            props: {},
            children: [{ id: 'feature-1', type: 'Feature', props: {} }],
          },
        ]}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
        missingIcons={new Map([['feature-1', ['palette']]])}
      />,
    );

    // Open: the child says it, the container does not repeat it.
    const [grid, feature] = screen.getAllByTestId('layer-row');
    expect(grid?.textContent).not.toContain('Contiene blocchi');
    expect(feature?.textContent).toContain('palette');

    fireEvent.click(screen.getByRole('button', { name: 'Comprimi' }));
    expect(screen.getByTestId('layer-row').textContent).toContain(
      "Contiene blocchi con un'icona che il tema non ha",
    );
  });

  it('marks a block still holding a placeholder, and says so on a collapsed parent', () => {
    render(
      <LayersPanel
        blocks={[
          {
            id: 'testimonials-1',
            type: 'Testimonials',
            props: {},
            children: [
              {
                id: 'testimonial-1',
                type: 'Testimonial',
                props: { author: '[Nome del cliente]' },
              },
            ],
          },
        ]}
        hoveredBlockId={null}
        selectedBlockId={null}
        onSelect={vi.fn()}
        placeholders={new Map([['testimonial-1', ['[Nome del cliente]']]])}
      />,
    );

    const [parent, child] = screen.getAllByTestId('layer-row');
    expect(parent?.textContent).not.toContain('segnaposto');
    expect(child?.textContent).toContain(
      'Ha un segnaposto da sostituire prima di pubblicare.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Comprimi' }));
    expect(screen.getByTestId('layer-row').textContent).toContain(
      'Un blocco qui dentro ha un segnaposto da sostituire prima di pubblicare.',
    );
  });
});

/*
 * Reparenting was impossible by construction: `computeNestedReorder`
 * refused every cross-parent drop, so moving a block into a Column meant
 * deleting it and building it again — losing its styling and its text.
 * These are the cases that decide whether the new path is safe.
 */
