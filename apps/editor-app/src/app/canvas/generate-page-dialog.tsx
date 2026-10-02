import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import type { Block } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Textarea } from '../../components/ui/textarea';
import type { GeneratedPageResult } from '../../lib/page-generation-api-client';
import { useTranslation } from '../../lib/use-translation';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { useCurrentSession } from '../auth/use-current-session';
import { usePageGeneration } from './use-page-generation';
import { InlineError } from '../../components/ui/inline-error';

export type GenerationMode = 'append' | 'replace';

/** The server's own bounds on a prompt (generatePageRequestSchema). */
const PROMPT_MIN_LENGTH = 3;
const PROMPT_MAX_LENGTH = 4000;

export interface GeneratePageDialogProps {
  siteId: string;
  /** The page's language: the copy is written in it. */
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page as it is: whether there is anything to add to, and what, for the model. */
  blocks: readonly Block[];
  /** A prompt written before the page existed (the New page dialog): it starts at once. */
  initialPrompt?: string;
  /** Why it cannot run here: said in the dialog instead of a form that would fail. */
  unavailable?: 'not-configured' | 'linked-translation';
  onGenerated: (page: GeneratedPageResult, mode: GenerationMode) => void;
}

/**
 * Describe a page, and the site's AI provider writes it into the canvas —
 * added at the end, or in place of what is there. Nothing is published:
 * what arrives is draft blocks, one undo away from gone.
 */
export function GeneratePageDialog({
  siteId,
  locale,
  open,
  onOpenChange,
  blocks,
  initialPrompt,
  unavailable,
  onGenerated,
}: GeneratePageDialogProps) {
  const { t } = useTranslation();
  const { can } = useCurrentSession();
  const configuresSite = can('configureSite');
  const { state, start, cancel } = usePageGeneration(siteId);
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [mode, setMode] = useState<GenerationMode>('append');
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const hasContent = blocks.length > 0;
  const generating = state.kind === 'generating';

  async function generate(effectiveMode: GenerationMode) {
    const page = await start({
      prompt: prompt.trim(),
      locale,
      ...(effectiveMode === 'append' && hasContent
        ? { existingOutline: pageOutline(blocks) }
        : {}),
    });
    if (page) {
      onGenerated(page, effectiveMode);
      onOpenChange(false);
    }
  }

  // The New page dialog already asked what the page is: asking again here
  // would be a second click that says nothing new.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (open && initialPrompt && !autoStarted.current) {
      autoStarted.current = true;
      void generate('replace');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the prompt the page was created with.
  }, [open, initialPrompt]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'replace' && hasContent) {
      setIsReplaceConfirmOpen(true);
      return;
    }
    void generate(hasContent ? mode : 'replace');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) cancel();
    onOpenChange(nextOpen);
  }

  const promptLength = prompt.trim().length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pageGeneration.title')}</DialogTitle>
          <DialogDescription>
            {t('pageGeneration.description', {
              language: languageName(locale),
            })}
          </DialogDescription>
        </DialogHeader>
        {unavailable ? (
          <>
            <p className="text-sm">
              {unavailable === 'linked-translation'
                ? t('pageGeneration.unavailableLinked')
                : configuresSite
                  ? t('pageGeneration.unavailableNotConfiguredAdmin')
                  : t('pageGeneration.unavailableNotConfigured')}
            </p>
            <DialogFooter>
              {unavailable === 'not-configured' && configuresSite && (
                <Button asChild variant="outline">
                  <Link to="/settings/ai">
                    {t('pageGeneration.openSettings')}
                  </Link>
                </Button>
              )}
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="generate-page-prompt">
                {t('pageGeneration.promptLabel')}
              </Label>
              <Textarea
                id="generate-page-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                maxLength={PROMPT_MAX_LENGTH}
                required
                disabled={generating}
                autoFocus
                aria-describedby="generate-page-prompt-hint"
              />
              <p
                id="generate-page-prompt-hint"
                className="text-xs text-muted-foreground"
              >
                {t('pageGeneration.promptHint')}
              </p>
            </div>

            {hasContent && (
              <fieldset className="flex flex-col gap-2" disabled={generating}>
                <legend className="mb-2 text-sm font-medium">
                  {t('pageGeneration.modeLabel')}
                </legend>
                <RadioGroup
                  value={mode}
                  onValueChange={(next) =>
                    setMode(next === 'replace' ? 'replace' : 'append')
                  }
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="append" id="generate-page-append" />
                    <Label
                      htmlFor="generate-page-append"
                      className="font-normal"
                    >
                      {t('pageGeneration.modeAppend')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="replace"
                      id="generate-page-replace"
                    />
                    <Label
                      htmlFor="generate-page-replace"
                      className="font-normal"
                    >
                      {t('pageGeneration.modeReplace')}
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>
            )}

            {/* One line kept for what is happening, so the dialog does not
              jump when it starts: the progress, or why there is no page. */}
            <div className="min-h-5">
              {/* Plain words, no spinner (DESIGN.md: no looping animation):
                how much has been written says it is moving. */}
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-muted-foreground tabular-nums"
              >
                {generating &&
                  (state.received > 0
                    ? t('pageGeneration.writing', { count: state.received })
                    : t('pageGeneration.starting'))}
              </p>
              {state.kind === 'failed' && (
                <InlineError>
                  {t(`pageGeneration.failures.${state.failure}`)}
                </InlineError>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {generating ? t('pageGeneration.stop') : t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={generating || promptLength < PROMPT_MIN_LENGTH}
              >
                {generating
                  ? t('pageGeneration.generating')
                  : t('pageGeneration.generate')}
              </Button>
            </DialogFooter>
          </form>
        )}
        <ConfirmActionDialog
          open={isReplaceConfirmOpen}
          onOpenChange={setIsReplaceConfirmOpen}
          title={t('pageGeneration.replaceConfirmTitle')}
          description={t('pageGeneration.replaceConfirmBody', {
            count: blocks.length,
          })}
          actionLabel={t('pageGeneration.replaceConfirmAction')}
          onConfirm={() => void generate('replace')}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * What is already on the page, top level, in a line each: the type and its
 * first words, so what the model adds fits what is there. Rich text is
 * reduced to its words.
 */
export function pageOutline(blocks: readonly Block[]): string[] {
  return blocks.slice(0, 60).map((block) => {
    const words = ['title', 'heading', 'text', 'body', 'label']
      .map((key) => block.props[key])
      .find(
        (value): value is string => typeof value === 'string' && value !== '',
      );
    const plain = words
      ?.replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (plain ? `${block.type}: ${plain}` : block.type).slice(0, 200);
  });
}

/** The language by name, in the editor's own ("Italian" / "italiano"); its code when the browser has none. */
function languageName(locale: string): string {
  try {
    return (
      new Intl.DisplayNames([document.documentElement.lang || 'en'], {
        type: 'language',
      }).of(locale) ?? locale.toUpperCase()
    );
  } catch {
    return locale.toUpperCase();
  }
}
