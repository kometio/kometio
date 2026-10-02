/**
 * The one row a statement that always answers with one: a `COUNT`, an
 * aggregate, an `INSERT … RETURNING`. An empty answer is the driver or the
 * statement breaking that, not a result with nothing in it — so it is
 * refused, instead of being read as a value that is not there.
 */
export function answeredRow<T>(rows: readonly T[], statement: string): T {
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`A ${statement} statement answered without its row.`);
  }
  return row;
}
