import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { InlineError } from '../../components/ui/inline-error';
import { ApiError } from '../../lib/http-client';
import { AuthPage } from './auth-page';

export interface SecondFactorFormProps {
  /**
   * Sends the code with the challenge the password led to. A wrong code is an
   * `ApiError` 401 whose body may carry a `challenge` to try again with.
   */
  onSubmit: (challenge: string, code: string) => Promise<void>;
  challenge: string;
  /** The challenge ran out or its tries were spent: back to the password. */
  onStartAgain: () => void;
}

/**
 * What a refused code is answered with: the new challenge when the person may
 * try again, and whether the codes of the app are held back for a while (too
 * many wrong ones), so that a right code that is refused is not a mystery.
 */
function refusalOf(error: unknown): {
  challenge: string | null;
  locked: boolean;
} {
  const none = { challenge: null, locked: false };
  if (!(error instanceof ApiError) || error.status !== 401) return none;
  const body = error.body;
  if (typeof body !== 'object' || body === null) return none;
  return {
    challenge:
      'challenge' in body && typeof body.challenge === 'string'
        ? body.challenge
        : null,
    locked: 'locked' in body && body.locked === true,
  };
}

/**
 * The second step of a sign-in, for a person who switched it on
 * (docs/adr/0137): one field, for the six digits of the app or, when the
 * app is lost, a recovery code. Which one is told by its look, so there is
 * nothing to choose and nothing to explain beyond the hint.
 *
 * A wrong code keeps what is on screen and says so; only when the server
 * has no new challenge to give (the tries are spent, or it ran out) does the
 * form hand the person back to the password.
 */
export function SecondFactorForm({
  onSubmit,
  challenge,
  onStartAgain,
}: SecondFactorFormProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [current, setCurrent] = useState(challenge);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(current, code);
    } catch (caught) {
      const { challenge: next, locked } = refusalOf(caught);
      if (next) {
        setCurrent(next);
        setCode('');
        setError(
          t(
            locked ? 'auth.secondFactor.locked' : 'auth.secondFactor.wrongCode',
          ),
        );
      } else {
        onStartAgain();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPage
      title={t('auth.secondFactor.title')}
      description={t('auth.secondFactor.description')}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="second-factor-code">
            {t('auth.secondFactor.codeLabel')}
          </Label>
          <Input
            id="second-factor-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            autoFocus
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className="font-mono"
            aria-describedby="second-factor-hint"
          />
          <p id="second-factor-hint" className="text-muted-foreground text-xs">
            {t('auth.secondFactor.hint')}
          </p>
        </div>
        {error && <InlineError>{error}</InlineError>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting
            ? t('auth.secondFactor.submitPending')
            : t('auth.secondFactor.submitIdle')}
        </Button>
        <Button
          type="button"
          variant="link"
          className="self-center px-0"
          onClick={onStartAgain}
        >
          {t('auth.secondFactor.startAgain')}
        </Button>
      </form>
    </AuthPage>
  );
}
