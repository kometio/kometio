import { useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { firstNamed } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import {
  createTerm,
  reorderTerms,
  type TaxonomyRecord,
  type TermRecord,
} from '../../lib/taxonomies-api-client';
import { termsQueryOptions } from './taxonomies-queries';
import { Button } from '../../components/ui/button';
import { OptionsSelect } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { InlineError } from '../../components/ui/inline-error';

export interface TermTreeEditorProps {
  taxonomy: TaxonomyRecord;
  defaultLocale: string;
}

/** Root first, then each term's children under it — the order the tree reads in. */
function inTreeOrder(
  terms: TermRecord[],
  parentId: string | null = null,
  depth = 0,
): { term: TermRecord; depth: number }[] {
  return terms
    .filter((term) => term.parentId === parentId)
    .flatMap((term) => [
      { term, depth },
      ...inTreeOrder(terms, term.id, depth + 1),
    ]);
}

/**
 * One category's terms (docs/adr/0064), as the tree they form: enough to
 * find your way around — the name, where its address is, how many terms
 * are inside it — and each one a link to the page where it is edited.
 *
 * The slug is shown next to the name rather than hidden behind an
 * "advanced" toggle, because it IS the address — a term's URL is the
 * reason the whole feature exists, and hiding it is how somebody
 * publishes fifty terms and only then notices they are all named
 * `categoria-2`.
 *
 * Editing a term used to unfold in place, five fields per language, and
 * pushed the rest of the tree off the screen: it has a page now
 * (term-editor-view.tsx). What stays here is adding one.
 */
export function TermTreeEditor({
  taxonomy,
  defaultLocale,
}: TermTreeEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const options = termsQueryOptions(taxonomy.id);
  const { data: terms = [] } = useQuery(options);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Up and Down beside each term, shown only while somebody is putting the
  // terms in order: a link row that also carried two buttons all the time
  // would be a busier list for the one time in ten it is wanted.
  const [reordering, setReordering] = useState(false);
  // Its own, under the list it is about: the form below has one for adding.
  const [reorderError, setReorderError] = useState<string | null>(null);
  const nameId = useId();
  const parentFieldId = useId();

  const createMutation = useMutation({
    mutationFn: () =>
      createTerm(taxonomy.id, {
        name: { [defaultLocale]: name.trim() },
        parentId: parentId || null,
      }),
    onSuccess: () => {
      setName('');
      setParentId('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
    onError: (caught: unknown) =>
      setError(
        caught instanceof ApiError && caught.status === 409
          ? t('taxonomies.addressTaken')
          : actionErrorMessage(caught, t('taxonomies.addTermFailed')),
      ),
  });

  const reorderMutation = useMutation({
    mutationFn: (input: {
      parentId: string | null;
      orderedTermIds: string[];
    }) => reorderTerms(taxonomy.id, input),
    // The API answers with the dimension's terms as they now read.
    onSuccess: (reordered) => {
      setReorderError(null);
      queryClient.setQueryData(options.queryKey, reordered);
    },
    onError: (caught: unknown) =>
      setReorderError(
        actionErrorMessage(caught, t('taxonomies.reorder.failed')),
      ),
  });

  /** Swaps a term with the sibling before or after it, and sends the whole sibling group in its new order. */
  function moveTerm(term: TermRecord, direction: -1 | 1) {
    const siblings = terms.filter(
      (candidate) => candidate.parentId === term.parentId,
    );
    const from = siblings.findIndex((candidate) => candidate.id === term.id);
    const to = from + direction;
    const moved = siblings[to];
    if (from < 0 || !moved) return;
    const ids = siblings.map((sibling) => sibling.id);
    ids[from] = moved.id;
    ids[to] = term.id;
    reorderMutation.mutate({ parentId: term.parentId, orderedTermIds: ids });
  }

  const ordered = inTreeOrder(terms);
  // Nothing to put in order while every term is alone under its parent.
  const canReorder = terms.some(
    (term) =>
      terms.filter((other) => other.parentId === term.parentId).length > 1,
  );
  const childCount = (term: TermRecord) =>
    terms.filter((candidate) => candidate.parentId === term.id).length;

  return (
    <div className="flex flex-col gap-3">
      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('taxonomies.noTerms')}
        </p>
      ) : (
        <>
          {canReorder && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={reordering}
                onClick={() => {
                  setReordering((current) => !current);
                  setReorderError(null);
                }}
              >
                {reordering
                  ? t('taxonomies.reorder.done')
                  : t('taxonomies.reorder.start')}
              </Button>
            </div>
          )}
          <ul className="flex flex-col divide-y rounded-lg border">
            {ordered.map(({ term, depth }) => {
              const children = childCount(term);
              const siblings = terms.filter(
                (candidate) => candidate.parentId === term.parentId,
              );
              const position = siblings.findIndex(
                (candidate) => candidate.id === term.id,
              );
              const name = firstNamed(term.name) || t('taxonomies.unnamed');
              return (
                <li key={term.id} className="flex items-stretch">
                  <Link
                    to="/taxonomies/$dimensionId/terms/$termId"
                    params={{ dimensionId: taxonomy.id, termId: term.id }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 p-2 pr-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    style={{ paddingLeft: 8 + depth * 20 }}
                  >
                    {/* One line, truncated as a whole: the name, then its
                      address. */}
                    <span className="min-w-0 truncate text-sm">
                      <span className="font-medium">{name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {taxonomy.prefix ? `/${taxonomy.prefix}/` : '/'}
                        {term.slugs[defaultLocale] ?? '—'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {children > 0 && (
                        <span className="tabular-nums">
                          {t('taxonomies.childCount', { count: children })}
                        </span>
                      )}
                      <ChevronRight className="size-4" aria-hidden />
                    </span>
                  </Link>
                  {reordering && siblings.length > 1 && (
                    // Named with the term, written like every action here; a
                    // term cannot go further than the end of its siblings.
                    <span className="flex shrink-0 items-center gap-1 pr-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-label={t('taxonomies.reorder.up', { name })}
                        disabled={position <= 0 || reorderMutation.isPending}
                        onClick={() => moveTerm(term, -1)}
                      >
                        {t('taxonomies.reorder.upShort')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-label={t('taxonomies.reorder.down', { name })}
                        disabled={
                          position >= siblings.length - 1 ||
                          reorderMutation.isPending
                        }
                        onClick={() => moveTerm(term, 1)}
                      >
                        {t('taxonomies.reorder.downShort')}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <InlineError>{reorderError}</InlineError>
        </>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) createMutation.mutate();
        }}
      >
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor={nameId}>{t('taxonomies.newTerm')}</Label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {taxonomy.hierarchical && ordered.length > 0 && (
          // Named above the field like every other, not only for a screen
          // reader: what "Inside" belongs to was left to be guessed.
          <div className="flex min-w-40 flex-col gap-1.5">
            <Label htmlFor={parentFieldId}>
              {t('taxonomies.newTermParent')}
            </Label>
            <OptionsSelect
              id={parentFieldId}
              className="w-auto min-w-40"
              value={parentId}
              onValueChange={setParentId}
              options={[
                { value: '', label: t('taxonomies.noParent') },
                ...terms.map((candidate) => ({
                  value: candidate.id,
                  label: firstNamed(candidate.name) || t('taxonomies.unnamed'),
                })),
              ]}
            />
          </div>
        )}
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          {t('taxonomies.addTerm')}
        </Button>
        <InlineError className="w-full">{error}</InlineError>
      </form>
    </div>
  );
}
