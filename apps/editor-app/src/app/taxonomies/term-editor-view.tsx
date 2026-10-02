import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';
import { ChevronRight, Trash2 } from 'lucide-react';
import { firstNamed, getLocaleDisplayName } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import {
  deleteTerm,
  updateTerm,
  type TaxonomyRecord,
  type TermRecord,
} from '../../lib/taxonomies-api-client';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { InlineError } from '../../components/ui/inline-error';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { OptionsSelect } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { collectDescendantIds } from '../common/page-hierarchy';
import { SeoMetaDialog } from '../common/seo-meta-dialog';
import { MediaPickerProvider } from '../media/media-picker-provider';
import { SettingsForm } from '../settings/settings-section';
import { useSavedForm } from '../settings/use-saved-form';
import { PageHeader } from '../shell/page-header';
import { useToast } from '../shell/toast-provider';
import { termsQueryOptions } from './taxonomies-queries';
import { TermLandingPageField } from './term-landing-page-field';
import { termToFormValues } from './term-form';
import { useTermEditor } from './use-term-editor';

export interface TermEditorViewProps {
  siteId: string;
  taxonomy: TaxonomyRecord;
  term: TermRecord;
  /** Every term of the taxonomy: the parent is chosen among them. */
  terms: TermRecord[];
  locales: string[];
  defaultLocale: string;
}

/**
 * The terms a term may move under: not itself, and nothing under it — the
 * API refuses both, and offering them would be offering an error.
 */
function parentCandidates(terms: TermRecord[], term: TermRecord): TermRecord[] {
  const below = collectDescendantIds(terms, term.id);
  return terms.filter(
    (candidate) => candidate.id !== term.id && !below.has(candidate.id),
  );
}

/**
 * One term of a category, on a page of its own: what it is called and
 * answers to in each language, where it sits, which page (if any) is
 * drawn at its address, and whether search engines may have it.
 *
 * It used to unfold inside the tree, where a term with five fields per
 * language pushed every other term off the screen, each field saved when
 * the cursor left it and nothing said so. Here it is one form, and one bar
 * that saves it — and a link, so a term can be sent to somebody.
 */
export function TermEditorView({
  siteId,
  taxonomy,
  term,
  terms,
  locales,
  defaultLocale,
}: TermEditorViewProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { save, isSaving } = useTermEditor(taxonomy, term);
  const { form, section } = useSavedForm({
    saved: term,
    failedMessage: t('saveBar.failed.term'),
    toFormValues: (saved) => termToFormValues(saved, locales),
    save,
    isSaving,
    // A 400 that says `name` is wrong is about the language everything
    // is written in first.
    fieldAliases: { name: `names.${defaultLocale}` },
    describeError: (error) =>
      error instanceof ApiError && error.status === 409
        ? t('taxonomies.addressTaken')
        : undefined,
  });
  const { register, control, setValue } = form;
  const [seoLocale, setSeoLocale] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const noindex = useWatch({ control, name: 'noindex' });
  const parentId = useWatch({ control, name: 'parentId' });
  const landingPageGroupId = useWatch({ control, name: 'landingPageGroupId' });
  const slugs = useWatch({ control, name: 'slugs' });

  const taxonomyName = firstNamed(taxonomy.name) || t('taxonomies.unnamed');
  const termName = firstNamed(term.name) || t('taxonomies.unnamed');

  const deleteMutation = useMutation({
    mutationFn: () => deleteTerm(term.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: termsQueryOptions(taxonomy.id).queryKey,
      });
      toast(t('taxonomies.termDeleted', { name: termName }), 'success');
      await navigate({ to: '/taxonomies' });
    },
    onError: (caught: unknown) => {
      setIsDeleting(false);
      setDeleteError(
        actionErrorMessage(caught, t('taxonomies.deleteTermFailed')),
      );
    },
  });

  // Not typed into a registered field, so the form would not notice the
  // change and the bar would never appear: each says so with `shouldDirty`.
  const change = { shouldDirty: true };

  return (
    // A term's SEO offers an OG image, and choosing one is the media picker.
    <MediaPickerProvider siteId={siteId}>
      <div className="flex flex-col gap-4">
        <nav aria-label={t('taxonomies.term.breadcrumb')}>
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <li>
              <Link
                to="/taxonomies"
                className="hover:text-foreground hover:underline"
              >
                {t('taxonomies.title')}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li>
              {/* The category has no page of its own: it is a section of
                  the list, which the address can point at. */}
              <Link
                to="/taxonomies"
                hash={taxonomy.id}
                className="hover:text-foreground hover:underline"
              >
                {taxonomyName}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="text-foreground">
              {termName}
            </li>
          </ol>
        </nav>
        <PageHeader
          title={termName}
          description={t('taxonomies.term.kindOf', { name: taxonomyName })}
        />
        <SettingsForm {...section} className="flex flex-col gap-6">
          {locales.map((locale) => (
            <fieldset
              key={locale}
              className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4"
            >
              <legend className="px-1 text-sm font-semibold">
                <span className="uppercase">{locale}</span>{' '}
                <span className="font-normal text-muted-foreground">
                  {getLocaleDisplayName(locale, i18n.language)}
                </span>
              </legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`term-name-${locale}`}>
                  {t('taxonomies.termName')}
                </Label>
                <Input
                  id={`term-name-${locale}`}
                  {...register(`names.${locale}`)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`term-slug-${locale}`}>
                  {t('taxonomies.termSlug')}
                </Label>
                <Input
                  id={`term-slug-${locale}`}
                  placeholder={t('taxonomies.termSlugEmpty')}
                  {...register(`slugs.${locale}`)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('taxonomies.term.address', {
                    address: `${taxonomy.prefix ? `/${taxonomy.prefix}/` : '/'}${
                      slugs[locale]?.trim() || '…'
                    }`,
                  })}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`term-description-${locale}`}>
                  {t('taxonomies.termDescription')}
                </Label>
                <Textarea
                  id={`term-description-${locale}`}
                  rows={3}
                  placeholder={t('taxonomies.termDescriptionHint')}
                  {...register(`descriptions.${locale}`)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSeoLocale(locale)}
                >
                  {t('taxonomies.termSeo')}
                </Button>
                {/* Its own dialog, with its own Save: said, so it is not
                    taken for part of this form. */}
                <span className="text-xs text-muted-foreground">
                  {t('taxonomies.term.seoOwnSave')}
                </span>
              </div>
            </fieldset>
          ))}

          {taxonomy.hierarchical && (
            <div className="flex max-w-sm flex-col gap-1.5">
              <Label htmlFor="term-parent">{t('taxonomies.parent')}</Label>
              <OptionsSelect
                id="term-parent"
                value={parentId}
                onValueChange={(next) => setValue('parentId', next, change)}
                options={[
                  { value: '', label: t('taxonomies.noParent') },
                  ...parentCandidates(terms, term).map((candidate) => ({
                    value: candidate.id,
                    label:
                      firstNamed(candidate.name) || t('taxonomies.unnamed'),
                  })),
                ]}
              />
            </div>
          )}

          <TermLandingPageField
            siteId={siteId}
            locale={defaultLocale}
            landingPageGroupId={landingPageGroupId}
            onChange={(next) => setValue('landingPageGroupId', next, change)}
          />

          <div className="flex max-w-xl items-start gap-2 text-sm">
            <Checkbox
              id="term-noindex"
              className="mt-0.5"
              checked={noindex}
              onCheckedChange={(checked) =>
                setValue('noindex', checked === true, change)
              }
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="term-noindex" className="font-normal">
                {t('taxonomies.termNoindex')}
              </Label>
              <span className="text-xs text-muted-foreground">
                {t('taxonomies.termNoindexHint')}
              </span>
            </div>
          </div>
        </SettingsForm>

        <section
          aria-labelledby="term-delete-title"
          className="flex max-w-2xl flex-col gap-2 border-t pt-4"
        >
          <h2 id="term-delete-title" className="text-sm font-semibold">
            {t('taxonomies.term.deleteTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('taxonomies.deleteTermDialog.description')}
          </p>
          <InlineError>{deleteError}</InlineError>
          <Button
            type="button"
            variant="destructive"
            className="self-start"
            onClick={() => {
              setDeleteError('');
              setIsDeleting(true);
            }}
          >
            <Trash2 />
            {t('taxonomies.deleteTerm')}
          </Button>
        </section>

        {seoLocale && (
          <SeoMetaDialog
            heading={t('taxonomies.termSeoTitle', {
              term: termName,
              locale: seoLocale.toUpperCase(),
            })}
            seoMeta={term.seoMeta[seoLocale] ?? { title: '', description: '' }}
            open
            onOpenChange={(open) => {
              if (!open) setSeoLocale(null);
            }}
            isSaving={false}
            onSave={async (next) => {
              await updateTerm(term.id, {
                seoMeta: { ...term.seoMeta, [seoLocale]: next },
              });
              void queryClient.invalidateQueries({
                queryKey: termsQueryOptions(taxonomy.id).queryKey,
              });
            }}
          />
        )}
        {isDeleting && (
          // Its children are promoted, not deleted with it — the database
          // says so (ON DELETE SET NULL), and the question has to say the
          // same thing.
          <ConfirmActionDialog
            open
            onOpenChange={(open) => !open && setIsDeleting(false)}
            title={t('taxonomies.deleteTermDialog.title')}
            description={t('taxonomies.deleteTermDialog.description')}
            onConfirm={() => deleteMutation.mutate()}
          />
        )}
      </div>
    </MediaPickerProvider>
  );
}
