import { describe, expect, it } from 'vitest';
import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it('writes bytes whole and everything larger with one decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(1229)).toBe('1.2 KB');
    expect(formatBytes(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });

  it('stops at gigabytes rather than inventing a unit', () => {
    expect(formatBytes(2048 * 1024 * 1024 * 1024)).toBe('2048.0 GB');
  });
});
