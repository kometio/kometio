import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { STARTER_IDS, type StarterId } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import { InlineError } from '../../components/ui/inline-error';
import { RadioGroup } from '../../components/ui/radio-group';
import { RadioOption } from '../common/radio-option';

/** What the person chose: one of the starting points, or none of them. */
type Choice = StarterId | 'blank';

const CHOICES: readonly Choice[] = [...STARTER_IDS, 'blank'];

export interface StarterPickerProps {
  /** The language the examples would be written in is not the site's: say so before anything is made. */
  fallbackLanguageName?: string;
  /** Resolves when the example is made; rejects with what to say. */
  onApply: (starterId: StarterId) => Promise<void>;
  /** Parts from a blank page: nothing is made. */
  onBlank: () => void;
  /** The sentence for a request that failed, or `null` for none. */
  error?: string | null;
  pending?: boolean;
}

/**
 * The choice a new site is offered (docs/adr/0136): three examples and a
 * blank page. Nothing is chosen at first, since any of them would be a
 * decision made for the person; pressing Continue with none says so, under
 * the options, instead of the button being dead.
 */
export function StarterPicker({
  fallbackLanguageName,
  onApply,
  onBlank,
  error = null,
  pending = false,
}: StarterPickerProps) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<Choice | ''>('');
  const [missing, setMissing] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (choice === '') {
      setMissing(true);
      return;
    }
    if (choice === 'blank') {
      onBlank();
      return;
    }
    void onApply(choice);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <RadioGroup
        value={choice}
        onValueChange={(value) => {
          const picked = CHOICES.find((candidate) => candidate === value);
          if (picked) {
            setChoice(picked);
            setMissing(false);
          }
        }}
        aria-label={t('starters.groupLabel')}
        aria-describedby={missing ? 'starters-missing' : undefined}
        className="flex flex-col gap-2"
      >
        {CHOICES.map((candidate) => (
          <RadioOption
            key={candidate}
            id={`starter-${candidate}`}
            value={candidate}
            label={t(`starters.options.${candidate}.name`)}
            description={t(`starters.options.${candidate}.description`)}
          />
        ))}
      </RadioGroup>

      {fallbackLanguageName && (
        <p className="text-muted-foreground text-xs">
          {t('starters.fallbackLanguage', { language: fallbackLanguageName })}
        </p>
      )}

      <InlineError id="starters-missing">
        {missing ? t('starters.choose') : null}
      </InlineError>
      <InlineError>{error}</InlineError>

      <Button type="submit" disabled={pending}>
        {pending ? t('starters.creating') : t('starters.continue')}
      </Button>
    </form>
  );
}
