import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { PAGE_SLUG_MAX_LENGTH, slugify } from '@kometio/shared-types';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { pageGenerationStatusQueryOptions } from '../settings/ai-settings-queries';
import { collectionsQueryOptions } from '../collections/collections-queries';
import { PageParentSelect } from './page-parent-select';
import { useParentPath } from './use-parent-path';
import { PageTemplateSelect } from './page-template-select';
import { publishedTemplatesQueryOptions } from '../sections/reusable-sections-queries';
import type { NewPageGroupInput } from './use-page-groups-list';
import { InlineError } from '../../components/ui/inline-error';

export interface NewPageGroupDialogProps {
  siteId: string;
  /** Whose titles the parent choice lists — the site's default language. */
  defaultLocale: string;
  /** The collection the page is being created in, whose default template is preselected — `null` on the Pages screen. */
  collectionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: NewPageGroupInput) => Promise<unknown>;
}

/**
 * i18n a livello di campo (see the plan) — new-page-dialog.tsx's
 * counterpart for the new PageGroup model. Still no locale choice (it
 * always seeds the site's default locale; the language switcher inside
 * the editor covers every other locale once the group exists), but the
 * page it hangs under is asked here rather than always the root
 * (docs/adr/0074).
 *
 * "Start from" lists the site's published templates (docs/adr/0072), and
 * only when there is at least one: a choice between "blank" and nothing is
 * not a choice. Inside a collection its default template is already
 * picked, because that is what the collection is for — but it is a
 * suggestion, and blank is always one click away.
 */
export function NewPageGroupDialog({
  siteId,
  defaultLocale,
  collectionId,
  open,
  onOpenChange,
  onCreate,
}: NewPageGroupDialogProps) {
  const { t } = useTranslation();
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    ...publishedTemplatesQueryOptions(siteId),
    enabled: open,
  });
  const { data: collections, isLoading: loadingCollections } = useQuery({
    ...collectionsQueryOptions(siteId),
    enabled: open && collectionId !== null,
  });
  // Until both have answered, "Start from" is not on screen yet and the
  // collection's default is unknown: Create would make a blank page that
  // the person never chose.
  const loadingChoice = loadingTemplates || loadingCollections;
  const [name, setName] = useState('');
  /** `undefined` until the person picks something — blank included — and until then the collection's default stands. */
  const [pickedTemplate, setPickedTemplate] = useState<
    string | null | undefined
  >();
  const [parentId, setParentId] = useState<string | null>(null);
  // "Describe it to AI": offered only where the site can generate a page.
  const { data: generationStatus } = useQuery({
    ...pageGenerationStatusQueryOptions(siteId),
    enabled: open,
  });
  const canGenerate = generationStatus?.availability === 'ready';
  const [startWithAi, setStartWithAi] = useState(false);
  const [prompt, setPrompt] = useState('');
  const generating = canGenerate && startWithAi;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const slug = slugify(name);
  // The whole address, not only the last part: under a parent a page is
  // /parent/its-own-slug, and the preview said "/its-own-slug" and let
  // the person find out otherwise.
  const parentPath = useParentPath(parentId, defaultLocale);
  const fullPath = `/${[...parentPath, slug].join('/')}`;
  const slugTooLong = slug.length > PAGE_SLUG_MAX_LENGTH;

  const collectionDefault = collections?.find(
    (collection) => collection.id === collectionId,
  )?.defaultTemplateId;
  // A default that is no longer on offer — deleted, say, a moment ago in
  // another tab — falls back to blank rather than selecting nothing.
  const suggested =
    templates.find((template) => template.id === collectionDefault)?.id ?? null;
  const templateId = pickedTemplate === undefined ? suggested : pickedTemplate;

  function createErrorMessage(err: unknown, sent: NewPageGroupInput): string {
    if (err instanceof ApiError && err.status === 409) {
      return t('pages.newPageDialog.slugTaken');
    }
    // A 404 names what it did not find, and three things sent here can
    // be gone by the time the request lands: the template, the parent
    // page, the section. Read against what was actually sent — asking
    // the AI sends no template, however the picker was left.
    if (err instanceof ApiError && err.status === 404) {
      const missing = err.displayMessage ?? '';
      if (sent.templateId !== null && missing.includes(sent.templateId)) {
        return t('pages.newPageDialog.templateUnavailable');
      }
      if (sent.parentId !== null && missing.includes(sent.parentId)) {
        return t('pages.newPageDialog.parentUnavailable');
      }
    }
    return actionErrorMessage(err, t('pages.newPageDialog.failed'));
  }

  // Same "always fresh on close" reasoning as new-page-dialog.tsx.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName('');
      setPickedTemplate(undefined);
      setParentId(null);
      setStartWithAi(false);
      setPrompt('');
      setError('');
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const sent: NewPageGroupInput = generating
      ? { name, templateId: null, parentId, generationPrompt: prompt.trim() }
      : { name, templateId, parentId };
    try {
      await onCreate(sent);
      handleOpenChange(false);
    } catch (err) {
      setError(createErrorMessage(err, sent));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pages.newPageDialog.title')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-page-group-name">
              {t('pages.newPageDialog.nameLabel')}
            </Label>
            <Input
              id="new-page-group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
              aria-invalid={slugTooLong ? true : undefined}
              aria-describedby={
                slugTooLong ? 'new-page-group-name-error' : undefined
              }
            />
            {slug && (
              // break-all: an address has no spaces to wrap at, and one
              // long enough widened the whole dialog past the screen,
              // taking Create out of reach.
              <p className="text-xs break-all text-muted-foreground">
                {t('pages.newPageDialog.slugPreview', { slug: fullPath })}
              </p>
            )}
            {slugTooLong && (
              <InlineError id="new-page-group-name-error">
                {t('pages.newPageDialog.nameTooLong', {
                  max: PAGE_SLUG_MAX_LENGTH,
                })}
              </InlineError>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-page-group-parent">
              {t('pages.parent.label')}
            </Label>
            <PageParentSelect
              id="new-page-group-parent"
              siteId={siteId}
              locale={defaultLocale}
              value={parentId}
              onChange={setParentId}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {t('pages.parent.hint')}
            </p>
          </div>
          {(templates.length > 0 || canGenerate) && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-page-group-template">
                {t('pages.newPageDialog.templateLabel')}
              </Label>
              <PageTemplateSelect
                id="new-page-group-template"
                templates={templates}
                value={templateId}
                onChange={(next) => {
                  setPickedTemplate(next);
                  setStartWithAi(false);
                }}
                generation={
                  canGenerate
                    ? {
                        selected: startWithAi,
                        onSelect: () => setStartWithAi(true),
                      }
                    : undefined
                }
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {generating
                  ? t('pageGeneration.startFromHint')
                  : t('pages.newPageDialog.templateHint')}
              </p>
            </div>
          )}
          {generating && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-page-group-prompt">
                {t('pageGeneration.promptLabel')}
              </Label>
              <Textarea
                id="new-page-group-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                maxLength={4000}
                required
                minLength={3}
                aria-describedby="new-page-group-prompt-hint"
              />
              <p
                id="new-page-group-prompt-hint"
                className="text-xs text-muted-foreground"
              >
                {t('pageGeneration.promptHint')}
              </p>
            </div>
          )}
          {error && <InlineError>{error}</InlineError>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t('pages.newPageDialog.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                loadingChoice ||
                slug.length === 0 ||
                slugTooLong ||
                (generating && prompt.trim().length < 3)
              }
            >
              {submitting
                ? t('pages.newPageDialog.creating')
                : t('pages.newPageDialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
