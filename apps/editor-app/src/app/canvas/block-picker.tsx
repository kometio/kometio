import { Fragment, useRef, useState, type ReactNode } from 'react';
import type { BlockDescriptor } from '@kometio/block-registry';
import { BlockIcon } from './block-icons';
import { Input } from '../../components/ui/input';
import { useTranslation } from '../../lib/use-translation';
import { ListItemButton } from '../../components/ui/list-item-button';
import { TileButton } from '../../components/ui/tile-button';

export interface BlockPickerCategory {
  title: string;
  types: string[];
}

export interface BlockDragHandlers {
  onDragStart: (descriptor: BlockDescriptor) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (
    descriptor: BlockDescriptor,
    pageX: number,
    pageY: number,
  ) => void;
}

export interface BlockPickerProps {
  categories: BlockPickerCategory[];
  registry: BlockDescriptor[];
  onInsert: (descriptor: BlockDescriptor) => void;
  /** Whether a block of this type has anywhere to go right now — a block that belongs inside one kind of container is not offered elsewhere. */
  canInsert?: (descriptor: BlockDescriptor) => boolean;
  /** When present, every button also becomes draggable onto the canvas — see canvas-editor-shell.tsx for the release-point computation. A plain click (no movement past the threshold) stays `onInsert` as today. */
  drag?: BlockDragHandlers;
  /** The blocks are offered but cannot be taken yet — while the canvas loads its page. The search still works. */
  disabled?: boolean;
}

/** The same threshold and heuristic as preview-bridge-client.ts's reorder drag — a mousedown+mouseup without moving far enough is an ordinary click, not a drag. */
const DRAG_START_THRESHOLD_PX = 4;

function DraggableBlockButton({
  descriptor,
  onInsert,
  drag,
  disabled,
}: {
  descriptor: BlockDescriptor;
  onInsert: (descriptor: BlockDescriptor) => void;
  drag?: BlockDragHandlers;
  disabled?: boolean;
}) {
  const { tLabel } = useTranslation();
  const pendingRef = useRef<{ startX: number; startY: number } | null>(null);
  const isDraggingRef = useRef(false);

  if (!drag) {
    return (
      <ListItemButton disabled={disabled} onClick={() => onInsert(descriptor)}>
        {/* A label has no space to wrap at when it is two words joined by
            a slash ("Testimonials/reviews"), and ran into the next column. */}
        <span className="min-w-0 break-words">
          {breakAfterSlashes(tLabel(descriptor.label))}
        </span>
      </ListItemButton>
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingRef.current = { startX: event.clientX, startY: event.clientY };
    isDraggingRef.current = false;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) {
      return;
    }
    if (!isDraggingRef.current) {
      const pending = pendingRef.current;
      if (!pending) {
        return;
      }
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD_PX) {
        return;
      }
      isDraggingRef.current = true;
      drag.onDragStart(descriptor);
    }
    drag.onDragMove(event.clientX, event.clientY);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const wasDragging = isDraggingRef.current;
    pendingRef.current = null;
    isDraggingRef.current = false;
    if (wasDragging && drag) {
      drag.onDragEnd(descriptor, event.clientX, event.clientY);
    } else {
      onInsert(descriptor);
    }
  }

  return (
    <TileButton
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title={tLabel(descriptor.label)}
      className="w-full touch-none px-1 py-2"
    >
      <BlockIcon
        name={descriptor.icon}
        size={20}
        className="shrink-0 text-foreground group-hover:text-primary"
      />
      {/* The name stays under every tile. An icon narrows the guess, it
          does not make it: `Carousel` and `Image slider` are the same
          picture to anybody who has not used both. */}
      <span className="line-clamp-2 w-full break-words">
        {breakAfterSlashes(tLabel(descriptor.label))}
      </span>
    </TileButton>
  );
}

/**
 * Click-to-insert into the selected container or at the root (the caller,
 * not yet canvas-editor-shell.tsx, decides the target by passing the result
 * to use-block-tree.ts's insertBlock) — the categories come from
 * @kometio/block-registry's config.ts/layout-config.ts. "Not registered = not
 * droppable": a type that does not appear in `registry` for the current
 * category simply has no button here, with no separate deny-list.
 *
 * Each category is a collapsible accordion (user feedback: with ~7
 * categories and over 40 block types, a flat list without visually distinct
 * headings was unreadable) — all closed by default, and several categories
 * can stay open together (`type="multiple"`).
 *
 * Each block button is also draggable onto the canvas when `drag` is passed
 * (Pointer Capture rather than a real HTML5 drag or document-level
 * listeners: the drag starts OUTSIDE the iframe and has to keep receiving
 * events even while the cursor visually passes over the iframe, which a
 * listener on `document` would not guarantee — ordinary hit-testing would
 * deliver those events to the document inside the iframe, not to the
 * parent).
 */
export function BlockPicker({
  categories,
  registry,
  onInsert,
  canInsert,
  drag,
  disabled,
}: BlockPickerProps) {
  const { t, tLabel } = useTranslation();
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();

  const nonEmptyCategories = categories
    .map((category) => ({
      ...category,
      descriptors: category.types
        .map((type) => registry.find((block) => block.type === type))
        .filter((descriptor): descriptor is BlockDescriptor => !!descriptor)
        // Against the TRANSLATED label and the type name both: somebody
        // reads "Immagine" in the list and types that, while somebody
        // reading the docs types "Image". Refusing either would be a
        // search that only works if you already knew where to look.
        // A block that belongs inside a specific container (a Column, a
        // Tab) is offered only while that container is the one an insert
        // would land in — offering it anywhere else is offering a block
        // that cannot be placed.
        .filter((descriptor) => !canInsert || canInsert(descriptor))
        .filter(
          (descriptor) =>
            search === '' ||
            tLabel(descriptor.label).toLowerCase().includes(search) ||
            descriptor.type.toLowerCase().includes(search),
        ),
    }))
    .filter((category) => category.descriptors.length > 0);

  return (
    <>
      <label className="mb-2 flex flex-col gap-1">
        <span className="sr-only">{t('canvas.blockSearch.label')}</span>
        <Input
          type="search"
          value={query}
          placeholder={t('canvas.blockSearch.placeholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {search !== '' && nonEmptyCategories.length === 0 && (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          {t('canvas.blockSearch.noResults', { query: query.trim() })}
        </p>
      )}
      {/*
        `value` is controlled while searching so every matching category
        opens: a search that found three blocks and left them behind
        collapsed sections would look like a search that found nothing.
        Uncontrolled otherwise, so the sections a person opened by hand
        stay as they left them.
      */}
      {/* Every category open, one scrolling column — not an accordion.
          Closed sections meant the panel showed six words and no blocks:
          to find out a Countdown exists you had to open three of them, or
          already know its name well enough to search for it. The whole
          job of an inserter is to answer "what can I put here". */}
      {nonEmptyCategories.map((category) => (
        <section key={category.title} className="mb-3">
          <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tLabel(category.title)}
          </h3>
          {/* As many columns as the panel has room for (it resizes from
              200 to 560px), never narrower than a name: three fixed
              columns left 64px a tile, and seventeen words of the Italian
              names were wider than that — measured, not guessed. */}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1">
            {category.descriptors.map((descriptor) => (
              <li key={descriptor.type}>
                <DraggableBlockButton
                  descriptor={descriptor}
                  onInsert={onInsert}
                  drag={drag}
                  disabled={disabled}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * "Testimonials/reviews" is one word to the browser, wider than any tile.
 * A <wbr> after each slash lets it wrap there instead of in the middle of
 * a word, without adding a character to the button's accessible name.
 */
function breakAfterSlashes(label: string): ReactNode {
  return label.split('/').flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <Fragment key={index}>
            /<wbr />
          </Fragment>,
          part,
        ],
  );
}
