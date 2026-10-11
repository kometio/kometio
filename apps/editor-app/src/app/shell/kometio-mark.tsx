/**
 * The product's mark, which the sidebar and the narrow header both wear:
 * the pixel comet and the word beside it. Folded to the strip there is only
 * room for the comet, and the word stays for a screen reader.
 *
 * The comet is the tab icon's own file, so there is one source for both. It
 * is a grid of 20 × 20 pixels and is drawn 20 px square — one CSS pixel per
 * cell, two on a dense screen — because any size that is not a multiple of
 * 20 makes some cells wider than others. The 24 px box around it keeps the
 * row as tall as it was.
 */
export function KometioMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 px-2 pt-1 text-sm font-semibold">
      <span aria-hidden className="flex size-6 items-center justify-center">
        <img src="/favicon.svg" alt="" className="size-5" />
      </span>
      <span className={compact ? 'sr-only' : undefined}>Kometio</span>
    </span>
  );
}
