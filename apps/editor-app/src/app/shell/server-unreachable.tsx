import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import type { ServerUnreachableError } from '../../lib/http-client';

/**
 * What the editor says when the server did not answer: the two addresses
 * that have to agree (this page, and the server it asks) and what to do.
 *
 * A browser gives the same nothing for a server that is stopped and for a
 * page opened at an address the installation was not set up for — the
 * second is how a self-hosted install most often fails the first time
 * (127.0.0.1 for localhost, or a server's IP for its name), and a white
 * page that then says "something went wrong" does not help anyone find it.
 */
export function ServerUnreachable({
  error,
  onRetry,
}: {
  error: ServerUnreachableError;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col gap-4 text-sm">
        <h1 className="text-xl font-semibold">
          {t('common.unreachable.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('common.unreachable.explanation')}
        </p>
        <dl className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">
              {t('common.unreachable.thisPage')}
            </dt>
            <dd className="font-mono text-xs break-all">
              {window.location.origin}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">
              {t('common.unreachable.theServer')}
            </dt>
            <dd className="font-mono text-xs break-all">{error.apiBaseUrl}</dd>
          </div>
        </dl>
        <p className="text-muted-foreground">
          {t('common.unreachable.whatToDo')}
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    </main>
  );
}
