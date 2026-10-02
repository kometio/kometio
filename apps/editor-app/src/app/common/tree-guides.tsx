/**
 * The lines that make a nested list read as a tree: one vertical guide
 * per level a row sits under, and an elbow joining the row to its parent.
 *
 * Indentation alone stops being readable at the third level — three rows
 * at three margins, and which parent the deepest one belongs to is a
 * guess. Shared by the canvas Layers panel and the Pages list because
 * they are the same drawing over the same question, and a second copy
 * would be a second place for the last-child rule to be got wrong.
 *
 * That rule is the whole difference between lines and a tree: the guide
 * under the LAST child stops at its elbow. Drawn past it, the tree shows
 * a branch continuing to rows that do not exist.
 */
export interface TreeGuidesProps {
  /** How many levels this row sits under. Zero draws nothing. */
  depth: number;
  /** Whether this row is the last of its siblings. */
  isLast: boolean;
  /** For each level above, whether that ancestor was the last of ITS siblings. */
  ancestorIsLast: readonly boolean[];
  /** One indent step, in pixels — the row's own `paddingLeft` per level. */
  indent: number;
  /** Row height, so the elbow meets the row in the middle. */
  rowHeight: number;
  /**
   * Left inset the row starts at, when its first level does not begin at
   * the container's edge. The guides are absolute inside the row, so
   * without it they would be drawn where the padding is, not where the
   * indentation is.
   */
  offset?: number;
}

export function TreeGuides({
  depth,
  isLast,
  ancestorIsLast,
  indent,
  rowHeight,
  offset = 0,
}: TreeGuidesProps) {
  return (
    <>
      {Array.from({ length: depth }, (_, level) => {
        const isOwnBranch = level === depth - 1;
        // An ANCESTOR's line stops once that ancestor was the last of its
        // siblings: its branch has no more rows below. This row's OWN
        // branch is a different question, answered by `isLast` — putting
        // both in one condition erases almost every line in the tree.
        if (!isOwnBranch && ancestorIsLast[level]) return null;
        return (
          <span
            key={level}
            aria-hidden
            className="absolute w-px bg-border"
            style={{
              left: offset + level * indent + indent / 2,
              top: 0,
              bottom: isOwnBranch && isLast ? undefined : 0,
              height: isOwnBranch && isLast ? rowHeight / 2 : undefined,
            }}
          />
        );
      })}
      {depth > 0 && (
        <span
          aria-hidden
          className="absolute h-px bg-border"
          style={{
            left: offset + (depth - 1) * indent + indent / 2,
            width: indent / 2,
            top: rowHeight / 2,
          }}
        />
      )}
    </>
  );
}
