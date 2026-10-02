/**
 * The product's mark, which the sidebar and the narrow header both wear:
 * the "K" wearing the accent, and the word beside it. Folded to the strip
 * there is only room for the "K", and the word stays for a screen reader.
 */
export function KometioMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 px-2 pt-1 text-sm font-semibold">
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
      >
        K
      </span>
      <span className={compact ? 'sr-only' : undefined}>Kometio</span>
    </span>
  );
}
