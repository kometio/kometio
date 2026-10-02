import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampPanelWidth,
  DEFAULT_PANEL_WIDTH,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  readPanelCollapsed,
  readPanelWidth,
  writePanelCollapsed,
  writePanelWidth,
} from './side-panel-preferences';

describe('side panel preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts at the default width with nothing stored', () => {
    expect(readPanelWidth('inspector')).toBe(DEFAULT_PANEL_WIDTH);
  });

  it('remembers a width, per panel', () => {
    writePanelWidth('inspector', 400);
    writePanelWidth('inserter', 300);

    expect(readPanelWidth('inspector')).toBe(400);
    expect(readPanelWidth('inserter')).toBe(300);
  });

  /*
   * A width chosen on a wide monitor comes back on a laptop, and a panel
   * wider than the screen is a canvas nobody can see. Clamping on the way
   * IN as well as on the way out is what makes a stored value safe.
   */
  it('clamps a stored width that no longer fits', () => {
    localStorage.setItem('kometio-panel-width:inspector', '9000');
    expect(readPanelWidth('inspector')).toBe(MAX_PANEL_WIDTH);

    localStorage.setItem('kometio-panel-width:inspector', '10');
    expect(readPanelWidth('inspector')).toBe(MIN_PANEL_WIDTH);
  });

  it('falls back to the default for a value that is not a number', () => {
    localStorage.setItem('kometio-panel-width:inspector', 'wide');
    expect(readPanelWidth('inspector')).toBe(DEFAULT_PANEL_WIDTH);
    expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_WIDTH);
  });

  it('remembers a collapsed panel, and tells "never chosen" apart from "open"', () => {
    expect(readPanelCollapsed('inserter')).toBeNull();
    writePanelCollapsed('inserter', true);
    expect(readPanelCollapsed('inserter')).toBe(true);
    writePanelCollapsed('inserter', false);
    expect(readPanelCollapsed('inserter')).toBe(false);
  });

  /*
   * A private window, or a browser set to block site data, throws on the
   * accessor itself. A panel that cannot remember its width is still a
   * panel — it must not take the editor down with it.
   */
  it('survives a browser that refuses local storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readPanelWidth('inspector')).toBe(DEFAULT_PANEL_WIDTH);
    expect(readPanelCollapsed('inspector')).toBeNull();
    expect(() => writePanelWidth('inspector', 320)).not.toThrow();
    expect(() => writePanelCollapsed('inspector', true)).not.toThrow();
  });
});
