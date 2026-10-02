import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useTranslation } from '../../lib/use-translation';

/**
 * An empty page is where writing it all at once is most useful: said in
 * the middle of the canvas, not only in the bar.
 */
export function EmptyPagePrompt({ onGenerate }: { onGenerate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center shadow-sm">
        <p className="text-sm font-medium">{t('pageGeneration.emptyTitle')}</p>
        <p className="text-sm text-muted-foreground">
          {t('pageGeneration.emptyBody')}
        </p>
        {/* Outline: Publish is the view's one accent button. */}
        <Button type="button" variant="outline" onClick={onGenerate}>
          <Sparkles />
          {t('pageGeneration.open')}
        </Button>
      </div>
    </div>
  );
}
