import { Button } from '../../components/ui/button';
import { useTranslation } from '../../lib/use-translation';

export interface BlockBreadcrumbProps {
  /** The selected block's ancestors, root first, then the block itself. */
  ancestry: readonly { id: string; label: string }[];
  onSelect: (blockId: string) => void;
}

/**
 * Where a nested block sits, each step a way back up to it: a block inside
 * a Column inside a Columns is otherwise unreachable except by hunting for
 * a pixel its children do not already cover. Only for a nested block; the
 * block itself is the properties panel's own heading, just below.
 */
export function BlockBreadcrumb({ ancestry, onSelect }: BlockBreadcrumbProps) {
  const { t } = useTranslation();
  const ancestors = ancestry.slice(0, -1);
  if (ancestors.length === 0) return null;
  return (
    <nav
      aria-label={t('canvas.selectionPath')}
      className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground"
    >
      {ancestors.map((step) => (
        <span key={step.id} className="flex min-w-0 items-center gap-1">
          <Button
            variant="inline"
            size="inline"
            className="font-normal"
            onClick={() => onSelect(step.id)}
          >
            <span className="truncate">{step.label}</span>
          </Button>
          <span aria-hidden="true">›</span>
        </span>
      ))}
      <span
        data-testid="block-breadcrumb"
        className="truncate font-medium text-foreground"
      >
        {ancestry[ancestry.length - 1]?.label}
      </span>
    </nav>
  );
}
