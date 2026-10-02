import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { EditingSection } from './canvas-frame';
import type { IframeGeometry } from './overlay-layer';

/** How tall the strip an empty header or footer is drawn in — room for the sentence and the button. */
const EMPTY_STRIP_PX = 96;

/**
 * How far the section reaches past its last block, on the side facing the
 * page: its own padding, which the blocks' rects do not include. Without
 * it the veil started at the last block and dimmed the bottom of the
 * header's own bar. It is a guess at a padding the editor cannot see (the
 * page is in another origin); a theme with more of it shows a little veil
 * over the edge of the bar, and one with less lets a little of the page
 * show at full strength.
 */
const SECTION_PADDING_PX = 16;

export interface SectionFocusOverlayProps {
  /** Which part of the page is the one being edited. */
  section: EditingSection;
  geometry: IframeGeometry;
  /** Where the section's own blocks are, viewport-relative inside the iframe — top-level ones only. */
  rects: readonly { top: number; height: number }[];
  /** Whether the section has no block at all: there is then nothing to point at, so the strip is drawn. */
  isEmpty: boolean;
  onAddBlock: () => void;
}

/**
 * Where the section lies inside the iframe, top to bottom — `null` while
 * there is nothing to measure yet. An empty one is the strip at its own edge
 * of the page.
 */
function stripOf({
  isHeader,
  isEmpty,
  rects,
  height,
}: {
  isHeader: boolean;
  isEmpty: boolean;
  rects: readonly { top: number; height: number }[];
  height: number;
}): { top: number; bottom: number } | null {
  if (isEmpty) {
    return isHeader
      ? { top: 0, bottom: EMPTY_STRIP_PX }
      : { top: height - EMPTY_STRIP_PX, bottom: height };
  }
  if (rects.length === 0) return null;
  // Anchored to the page's own edge: a header has nothing above it and a
  // footer nothing below, so the only veil is on the side of the page.
  return {
    top: isHeader
      ? Number.NEGATIVE_INFINITY
      : Math.min(...rects.map((rect) => rect.top)) - SECTION_PADDING_PX,
    bottom: isHeader
      ? Math.max(...rects.map((rect) => rect.top + rect.height)) +
        SECTION_PADDING_PX
      : Number.POSITIVE_INFINITY,
  };
}

/**
 * What tells you WHAT you are editing when the header or the footer is.
 *
 * The canvas draws a whole page, because a header has none of its own and
 * means nothing without one under it; and nothing in that picture said which
 * part answers to your clicks. Everything that is not the section is veiled,
 * and a label that stays where it is says why.
 *
 * The veil is laid over the iframe from here, in the editor, rather than
 * done to the page inside it: the page is the public site's, in another
 * origin, and it is drawn the same way to a visitor. So the strip is worked
 * out from where the section's blocks are, with the geometry the rest of the
 * overlays use, and the veil lets the pointer through — the page scrolls
 * under it as ever.
 *
 * An empty section has no blocks to measure: its strip is drawn by this,
 * with a sentence and the button that opens Add.
 */
export function SectionFocusOverlay({
  section,
  geometry,
  rects,
  isEmpty,
  onAddBlock,
}: SectionFocusOverlayProps) {
  const { t } = useTranslation();
  const isHeader = section === 'header';
  const height = geometry.height;

  const strip = stripOf({ isHeader, isEmpty, rects, height });
  // Clamped to the iframe: a strip scrolled half out of view is veiled
  // around what is left of it.
  const above = strip ? Math.min(Math.max(strip.top, 0), height) : 0;
  const below = strip ? Math.min(Math.max(strip.bottom, 0), height) : height;
  const veil = 'pointer-events-none bg-background/60';

  return (
    <>
      {strip && height > 0 && (
        <>
          {above > 0 && (
            <div
              aria-hidden
              className={veil}
              style={{
                position: 'fixed',
                top: geometry.top,
                left: geometry.left,
                width: geometry.width,
                height: above,
              }}
            />
          )}
          {below < height && (
            <div
              aria-hidden
              className={veil}
              style={{
                position: 'fixed',
                top: geometry.top + below,
                left: geometry.left,
                width: geometry.width,
                height: height - below,
              }}
            />
          )}
        </>
      )}
      {/* Fixed to the canvas, not to the strip: a strip scrolled out of
          view must not take its explanation with it. On the side of the
          page that is not the section's, where it hides nothing. */}
      <p
        className={`pointer-events-none absolute left-1/2 z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full border bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow-sm ${
          isHeader ? 'bottom-3' : 'top-3'
        }`}
      >
        {t(
          isHeader
            ? 'canvas.sectionFocus.header'
            : 'canvas.sectionFocus.footer',
        )}
      </p>
      {isEmpty && (
        <div
          className={`absolute inset-x-0 z-10 flex items-center justify-center gap-3 border-dashed border-primary/50 bg-card/95 px-4 ${
            isHeader ? 'top-0 border-b-2' : 'bottom-0 border-t-2'
          }`}
          style={{ height: EMPTY_STRIP_PX }}
        >
          <p className="text-sm font-medium">
            {t(
              isHeader
                ? 'canvas.sectionFocus.emptyHeader'
                : 'canvas.sectionFocus.emptyFooter',
            )}
          </p>
          <Button type="button" variant="outline" onClick={onAddBlock}>
            <Plus />
            {t('canvas.propertiesPanel.addBlock')}
          </Button>
        </div>
      )}
    </>
  );
}
