import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { actionErrorMessage } from '../../lib/http-client';
import {
  testRedirect,
  type RedirectTestResult,
} from '../../lib/redirects-api-client';

export interface TestRedirectDialogProps {
  siteId: string;
  onOpenChange: (open: boolean) => void;
  /** An address nothing answers: the way to make a rule for it, one step from the answer. */
  onAddFor: (address: string) => void;
}

/**
 * "What does a visitor get at this address?" — asked of the same function the
 * site answers with, so that "I added it and it does not work" has a reason
 * on screen: a page that answers first, a rule that points at a page not yet
 * published, a circle.
 */
export function TestRedirectDialog({
  siteId,
  onOpenChange,
  onAddFor,
}: TestRedirectDialogProps) {
  const { t } = useTranslation();
  const ids = useId();
  const [address, setAddress] = useState('');
  const [answer, setAnswer] = useState<{
    address: string;
    result: RedirectTestResult;
  } | null>(null);
  const [error, setError] = useState('');

  const check = useMutation({
    mutationFn: (asked: string) => testRedirect(siteId, asked),
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const asked = address.trim();
    if (asked === '') return;
    setError('');
    try {
      setAnswer({ address: asked, result: await check.mutateAsync(asked) });
    } catch (failure) {
      setAnswer(null);
      setError(actionErrorMessage(failure, t('redirects.test.failed')));
    }
  }

  // An answer belongs to the address it was asked of: once that is changed,
  // it is not an answer to what is in the field.
  const current =
    answer !== null && answer.address === address.trim() ? answer.result : null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('redirects.test.title')}</DialogTitle>
          <DialogDescription>
            {t('redirects.test.description')}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-address`}>
              {t('redirects.test.label')}
            </Label>
            <Input
              id={`${ids}-address`}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={t('redirects.test.placeholder')}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </div>
          {current !== null && (
            <div
              role="status"
              className="flex flex-col items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
            >
              <p>{describeResult(t, current)}</p>
              {current.outcome === 'none' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddFor(address.trim())}
                >
                  {t('redirects.test.addFor')}
                </Button>
              )}
            </div>
          )}
          <InlineError>{error}</InlineError>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('redirects.test.done')}
            </Button>
            <Button
              type="submit"
              disabled={check.isPending || address.trim() === ''}
            >
              {check.isPending
                ? t('redirects.test.checking')
                : t('redirects.test.run')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function describeResult(t: TFunction, result: RedirectTestResult): string {
  switch (result.outcome) {
    case 'page':
      return t('redirects.test.result.page', { path: result.path });
    case 'moved':
      return t('redirects.test.result.moved', { location: result.location });
    case 'redirect':
      return result.status === 302
        ? t('redirects.test.result.redirect302', { location: result.location })
        : t('redirects.test.result.redirect301', { location: result.location });
    case 'gone':
      return t('redirects.test.result.gone');
    case 'broken':
      return t('redirects.test.result.broken');
    case 'loop':
      return t('redirects.test.result.loop');
    case 'none':
      return t('redirects.test.result.none');
  }
}
