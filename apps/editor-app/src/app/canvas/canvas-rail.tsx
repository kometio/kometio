import { ExternalLink, Keyboard, Layers, Palette, Plus } from 'lucide-react';
import { RailAnchor, RailButton } from '../common/rail-item';
import { useTranslation } from '../../lib/use-translation';

/** What the left panel can show — one at a time. */
export type LeftPanelView = 'insert' | 'layers';

export interface CanvasRailProps {
  /** The view the left panel shows, or null when it is closed. */
  openView: LeftPanelView | null;
  /** Opens that view, or closes the panel when it is the one already open. */
  onToggleView: (view: LeftPanelView) => void;
  /** Whether to offer the Style page: only to who may configure the site, and where there is a site to style. */
  showStyles?: boolean;
  onOpenShortcuts: () => void;
}

export const LEFT_PANEL_ID = 'canvas-left-panel';

/**
 * The strip down the left edge of the canvas: the two things the left
 * panel can hold (the page's templates live under Add, with the blocks), then the two dialogs that are about the whole editor
 * rather than this page.
 *
 * It replaces a left panel that was permanently the block inserter — the
 * biggest panel on screen for the thing done least — and the Layers /
 * Properties tabs on the right, which meant selecting a block took the
 * tree away at the exact moment you wanted to know where it sat. Layers now
 * lives here and Properties has the right panel to itself.
 *
 * Nothing in the strip is reachable only by keyboard: "/" opens Add and
 * "?" is Shortcuts, but both are buttons first.
 */
export function CanvasRail({
  openView,
  onToggleView,
  showStyles = false,
  onOpenShortcuts,
}: CanvasRailProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('canvas.rail.label')}
      className="flex w-18 shrink-0 flex-col items-center gap-1 border-r bg-sidebar px-0.5 py-2 max-md:hidden"
    >
      <RailButton
        label={t('canvas.rail.insert')}
        icon={<Plus />}
        aria-pressed={openView === 'insert'}
        aria-controls={LEFT_PANEL_ID}
        onClick={() => onToggleView('insert')}
      />
      <RailButton
        label={t('canvas.rail.layers')}
        icon={<Layers />}
        aria-pressed={openView === 'layers'}
        aria-controls={LEFT_PANEL_ID}
        onClick={() => onToggleView('layers')}
      />
      <div className="flex-1" />
      {showStyles && (
        // The Style page, in another tab so the work on the canvas is not
        // interrupted: it is the one home of everything about the site's
        // look, and the small arrow says it leaves.
        <RailAnchor
          href="/style"
          label={t('canvas.rail.styles')}
          fullName={t('canvas.rail.stylesFullName')}
          icon={
            <span className="relative inline-flex">
              <Palette />
              <ExternalLink
                aria-hidden
                className="absolute -top-1 -right-2 size-2.5!"
              />
            </span>
          }
        />
      )}
      <RailButton
        label={t('canvas.rail.shortcuts')}
        icon={<Keyboard />}
        onClick={onOpenShortcuts}
      />
    </nav>
  );
}
