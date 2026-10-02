import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Active, Over } from '@dnd-kit/core';
import { useDragAnnouncements } from './use-drag-announcements';

const NAMES: Record<string, string> = {
  a: 'Titolo',
  b: 'Testo',
  c: 'Immagine',
};

const RECT = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };

/** An item as `@dnd-kit/sortable` hands it over: its place in the list rides in `data`. */
function active(id: string, index?: number): Active {
  return {
    id,
    data: {
      current:
        index === undefined
          ? {}
          : {
              sortable: { index, items: ['a', 'b', 'c'], containerId: 'list' },
            },
    },
    rect: { current: { initial: null, translated: null } },
  };
}

function over(id: string, index?: number): Over {
  return { ...active(id, index), rect: RECT, disabled: false };
}

function render() {
  return renderHook(() =>
    useDragAnnouncements((id) => NAMES[String(id)] ?? String(id)),
  ).result.current;
}

describe('useDragAnnouncements', () => {
  it("speaks the editor's language, naming the item as its row does and saying where it now sits", () => {
    const { announcements } = render();

    expect(announcements.onDragStart({ active: active('c', 2) })).toBe(
      'Hai preso Immagine, posizione 3 di 3.',
    );
    expect(
      announcements.onDragOver({ active: active('c', 2), over: over('b', 1) }),
    ).toBe('Immagine ora è in posizione 2 di 3.');
    expect(
      announcements.onDragEnd({ active: active('c', 2), over: over('a', 0) }),
    ).toBe('Hai lasciato Immagine in posizione 1 di 3.');
    expect(
      announcements.onDragCancel({ active: active('c', 2), over: null }),
    ).toBe("Spostamento di Immagine annullato: resta dov'era.");
  });

  it('still names the item where no list position is known', () => {
    const { announcements } = render();

    expect(announcements.onDragStart({ active: active('a') })).toBe(
      'Hai preso Titolo.',
    );
    expect(
      announcements.onDragOver({ active: active('a'), over: over('b') }),
    ).toBe('Hai spostato Titolo.');
    expect(announcements.onDragOver({ active: active('a'), over: null })).toBe(
      "Titolo è fuori dall'elenco.",
    );
  });

  it('tells how to drag with the keyboard, in the same language', () => {
    expect(render().screenReaderInstructions.draggable).toContain(
      'Spazio o Invio',
    );
  });
});
