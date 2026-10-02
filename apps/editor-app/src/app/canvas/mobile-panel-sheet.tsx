import type { ReactNode } from 'react';
import { Layers, Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { TileButton } from '../../components/ui/tile-button';
import { useTranslation } from '../../lib/use-translation';

export type MobileSheet = 'insert' | 'layers' | 'properties';

export interface MobilePanelBarProps {
  open: MobileSheet | null;
  onToggle: (sheet: MobileSheet) => void;
}

/**
 * Below `md`, the rail and the two side panels become this: three named
 * buttons along the bottom of the screen, each opening its panel as a
 * sheet over the lower part of the canvas.
 *
 * At 390px the old layout put the block palette across the whole width
 * and cut the right panel in half, and the page being edited was not on
 * screen at all. The canvas is the whole screen now, and a panel is
 * something you open over it and close again.
 */
export function MobilePanelBar({ open, onToggle }: MobilePanelBarProps) {
  const { t } = useTranslation();
  const items: { sheet: MobileSheet; label: string; icon: ReactNode }[] = [
    { sheet: 'insert', label: t('canvas.rail.insert'), icon: <Plus /> },
    { sheet: 'layers', label: t('canvas.rail.layers'), icon: <Layers /> },
    {
      sheet: 'properties',
      label: t('canvas.mobileBar.properties'),
      icon: <SlidersHorizontal />,
    },
  ];
  return (
    <nav
      aria-label={t('canvas.mobileBar.label')}
      className="grid shrink-0 grid-cols-3 gap-1 border-t bg-sidebar px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] md:hidden"
    >
      {items.map(({ sheet, label, icon }) => (
        <TileButton
          key={sheet}
          aria-pressed={open === sheet}
          onClick={() => onToggle(sheet)}
          className="py-1.5 font-medium aria-pressed:bg-primary/10 aria-pressed:text-foreground aria-pressed:[&_svg]:text-primary [&_svg]:size-5"
        >
          {icon}
          {label}
        </TileButton>
      ))}
    </nav>
  );
}

export interface MobileSheetPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The sheet itself: over the lower part of the canvas, never all of it —
 * the block you are changing stays in view above it.
 */
export function MobileSheetPanel({
  title,
  onClose,
  children,
}: MobileSheetPanelProps) {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={title}
      className="absolute inset-x-0 bottom-0 z-10 flex h-3/5 flex-col rounded-t-xl border-t bg-background shadow-lg"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t('canvas.mobileBar.close')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
