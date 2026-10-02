const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * "812 B", "1.2 KB", "3.4 MB" — a size the way a person reads one.
 *
 * One rounding for every place a size shows (a file in the library, the
 * storage figure on the dashboard), so one file and the total it belongs
 * to never disagree about how big it is.
 */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${unitIndex === 0 ? value : value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}
