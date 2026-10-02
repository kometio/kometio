import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionFocusOverlay } from './section-focus-overlay';

const GEOMETRY = { top: 100, left: 200, width: 800, height: 600 };

function renderOverlay(
  props: Partial<Parameters<typeof SectionFocusOverlay>[0]> = {},
) {
  const onAddBlock = vi.fn();
  const view = render(
    <SectionFocusOverlay
      section="header"
      geometry={GEOMETRY}
      rects={[{ top: 0, height: 80 }]}
      isEmpty={false}
      onAddBlock={onAddBlock}
      {...props}
    />,
  );
  return { onAddBlock, ...view };
}

/** The veils, in the order they are drawn: what is above the section, then what is below. */
function veils(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[aria-hidden]')];
}

describe('SectionFocusOverlay', () => {
  it('veils everything under a header, from a little past its last block to the bottom of the canvas', () => {
    const { container } = renderOverlay();

    const [veil] = veils(container);
    expect(veils(container)).toHaveLength(1);
    // Inside the iframe the last block ends at 80, and the header's own
    // padding takes 16 more; the iframe starts at 100.
    expect(veil.style.top).toBe('196px');
    expect(veil.style.left).toBe('200px');
    expect(veil.style.width).toBe('800px');
    expect(veil.style.height).toBe('504px');
    // Let through: the page under it scrolls as ever.
    expect(veil.className).toContain('pointer-events-none');
  });

  // Nothing is above a header and nothing below a footer but their own
  // edge of the page: veiling the far side would dim their own padding.
  it('veils what is above a footer, and nothing below it', () => {
    const { container } = renderOverlay({
      section: 'footer',
      rects: [{ top: 400, height: 100 }],
    });

    expect(veils(container)).toHaveLength(1);
    const [above] = veils(container);
    expect(above.style.top).toBe('100px');
    expect(above.style.height).toBe('384px');
  });

  it('veils the whole canvas when the section has been scrolled out of it', () => {
    const { container } = renderOverlay({ rects: [{ top: -300, height: 80 }] });

    const [veil] = veils(container);
    expect(veil.style.top).toBe('100px');
    expect(veil.style.height).toBe('600px');
  });

  it('measures the strip from all the blocks of the section, not the first', () => {
    const { container } = renderOverlay({
      rects: [
        { top: 0, height: 40 },
        { top: 40, height: 60 },
      ],
    });

    // 100 where the last block ends, plus the padding, from the iframe's 100.
    expect(veils(container)[0].style.top).toBe('216px');
  });

  it('draws nothing over a section that fills the canvas', () => {
    const { container } = renderOverlay({ rects: [{ top: 0, height: 590 }] });

    expect(veils(container)).toHaveLength(0);
  });

  it('keeps its explanation where it is read, on the side of the page that is not the section', () => {
    const header = renderOverlay();
    expect(
      screen.getByText('Pagina d’esempio — qui si modifica solo l’header')
        .className,
    ).toContain('bottom-3');
    header.unmount();

    renderOverlay({ section: 'footer' });
    expect(
      screen.getByText('Pagina d’esempio — qui si modifica solo il footer')
        .className,
    ).toContain('top-3');
  });

  it('says nothing about a strip while there is nothing to measure yet', () => {
    const { container } = renderOverlay({ rects: [] });

    expect(veils(container)).toHaveLength(0);
    // The label does not wait for the geometry.
    expect(screen.getByText(/qui si modifica solo/)).toBeTruthy();
  });

  describe('an empty section', () => {
    it('is drawn as a strip of its own, with the button that opens Add', () => {
      const { container, onAddBlock } = renderOverlay({
        isEmpty: true,
        rects: [],
      });

      expect(screen.getByText('Header vuoto')).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: 'Aggiungi un blocco' }),
      );
      expect(onAddBlock).toHaveBeenCalledTimes(1);
      // The strip is the top 96px; the veil starts under it.
      expect(veils(container)[0].style.top).toBe('196px');
    });

    it('sits at the bottom for a footer', () => {
      const { container } = renderOverlay({
        section: 'footer',
        isEmpty: true,
        rects: [],
      });

      expect(screen.getByText('Footer vuoto')).toBeTruthy();
      expect(veils(container)[0].style.height).toBe('504px');
    });
  });
});
