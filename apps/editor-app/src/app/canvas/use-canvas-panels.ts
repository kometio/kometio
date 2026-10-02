import { useCallback, useEffect, useRef, useState } from 'react';
import type { MobileSheet } from './mobile-panel-sheet';
import { useIsNarrow } from '../common/use-is-narrow';
import { useLeftPanel } from './use-left-panel';
import { useSidePanel } from './use-side-panel';

/**
 * The panels around the canvas, and how the editor reaches them.
 *
 * The left panel holds one thing at a time — Add or Layers — picked in the
 * rail; the right panel is Properties and nothing else. They were an
 * inserter that never went away on the left and Layers/Properties as tabs
 * on the right, so selecting a block swapped the tree out for its fields at
 * the moment you wanted both. Below `md` neither exists: each is a sheet
 * over the canvas, one at a time (mobile-panel-sheet.tsx).
 */
export function useCanvasPanels() {
  const leftPanel = useLeftPanel();
  const inspectorPanel = useSidePanel('inspector');
  const isNarrow = useIsNarrow();
  const [mobileSheet, setMobileSheet] = useState<MobileSheet | null>(null);
  /**
   * Bumped by "Properties" in the floating toolbar. The focus has to happen
   * AFTER the panel has opened, which is a render away — so it is a request
   * the effect below answers, not a `focus()` on a DOM node that may not be
   * there yet.
   */
  const [focusPropertiesRequest, setFocusPropertiesRequest] = useState(0);
  const propertiesPanelRef = useRef<HTMLDivElement>(null);

  /**
   * It opens the panel first: a collapsed one renders none of its content,
   * so focusing would have put the keyboard on a forty-pixel strip and left
   * the person where they were. On a phone the panel is a sheet, and this
   * is what opens it.
   */
  const focusProperties = useCallback(() => {
    if (isNarrow) {
      setMobileSheet('properties');
    } else {
      inspectorPanel.expand();
    }
    setFocusPropertiesRequest((request) => request + 1);
  }, [inspectorPanel, isNarrow]);

  /** Add, wherever it lives at this width — the rail's panel, or the sheet. */
  const openInsert = useCallback(() => {
    if (isNarrow) {
      setMobileSheet('insert');
    } else {
      leftPanel.showView('insert');
    }
  }, [isNarrow, leftPanel]);

  useEffect(() => {
    if (focusPropertiesRequest > 0) {
      propertiesPanelRef.current?.focus();
    }
  }, [focusPropertiesRequest]);

  return {
    leftPanel,
    inspectorPanel,
    isNarrow,
    mobileSheet,
    setMobileSheet,
    propertiesPanelRef,
    focusProperties,
    openInsert,
  };
}
