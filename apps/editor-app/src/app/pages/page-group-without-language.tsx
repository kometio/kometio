import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { useApplySavedInterfaceLanguage } from '../account/use-interface-language';

/**
 * A page that exists with no language at all.
 *
 * The editor cannot open one — everything in it hangs off the language
 * being edited — and until the page and its first language were created
 * together (docs/adr/0072) a New page refused for its address left exactly
 * this behind, which opened onto a crash. What is left of those pages
 * says what it is and where to deal with it, instead of "Something went
 * wrong".
 */
export function PageGroupWithoutLanguage() {
  const { t } = useTranslation();
  useApplySavedInterfaceLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-md flex-col gap-3 rounded-lg border p-6">
        <h1 className="text-lg font-semibold">
          {t('pages.editor.noLanguage.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('pages.editor.noLanguage.body')}
        </p>
        <Button asChild variant="outline" className="self-start">
          <Link to="/pages">{t('pages.editor.noLanguage.back')}</Link>
        </Button>
      </div>
    </div>
  );
}
