import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useTranslation } from '../../lib/use-translation';
import type { CanvasPageMenuItem } from './canvas-top-bar';

export interface NoSelectionPanelProps {
  /** Opens Add in the left panel — on a phone, the Add sheet. */
  onAddBlock: () => void;
  /** The page's own actions (SEO, history, translations…): the same entries as the Page menu in the bar. */
  pageActions?: CanvasPageMenuItem[];
  /**
   * Settings of the thing being edited that are not a block's — the
   * header's "stick while scrolling". With nothing selected the panel is
   * about the thing itself, so they sit here with their names on them
   * rather than as a switch in the bar of a canvas.
   */
  extra?: ReactNode;
}

/**
 * What the Properties panel holds when no block is selected.
 *
 * It used to hold one grey sentence, and before that the panel was a tab
 * that Layers took over. With nothing selected, the thing you are working
 * on is the page itself — so this says how to pick a block and then offers
 * what can be done to the page, as buttons with their names on them.
 */
export function NoSelectionPanel({
  onAddBlock,
  pageActions = [],
  extra,
}: NoSelectionPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          {t('canvas.propertiesPanel.noSelectionTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('canvas.properties.noSelection')}
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={onAddBlock}
        >
          <Plus />
          {t('canvas.propertiesPanel.addBlock')}
        </Button>
      </div>
      {extra && (
        <div className="flex flex-col gap-2 border-t pt-3">{extra}</div>
      )}
      {pageActions.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('canvas.propertiesPanel.pageActions')}
          </h3>
          {pageActions.map(({ label, icon: Icon, onSelect, href }) =>
            href ? (
              <Button
                key={label}
                asChild
                variant="ghost"
                className="justify-start gap-2 px-2"
              >
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <Icon />
                  {label}
                </a>
              </Button>
            ) : (
              <Button
                key={label}
                type="button"
                variant="ghost"
                className="justify-start gap-2 px-2"
                onClick={onSelect}
              >
                <Icon />
                {label}
              </Button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
