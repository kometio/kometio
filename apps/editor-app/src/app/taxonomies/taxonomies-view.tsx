import { useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { firstNamed } from '@kometio/shared-types';
import { useTranslation } from '../../lib/use-translation';
import {
  createTaxonomy,
  deleteTaxonomy,
  updateTaxonomy,
  type TaxonomyRecord,
} from '../../lib/taxonomies-api-client';
import {
  taxonomiesQueryOptions,
  termsQueryOptions,
} from './taxonomies-queries';
import { siteQueryOptions } from '../settings/site-queries';
import { Button } from '../../components/ui/button';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { PromptDialog } from '../common/prompt-dialog';
import { NewTaxonomyDialog } from './new-taxonomy-dialog';
import { TermTreeEditor } from './term-tree-editor';
import { PageHeader } from '../shell/page-header';
import { useToast } from '../shell/toast-provider';
import { actionErrorMessage } from '../../lib/http-client';

export interface TaxonomiesViewProps {
  siteId: string;
}

/**
 * The categories a site classifies along, and the terms inside them
 * (docs/adr/0064).
 *
 * Its own screen and not a tab of the page editor: a category outlives
 * any one page, and half the point of the model is that the same terms
 * will later classify things that are not pages at all.
 */
export function TaxonomiesView({ siteId }: TaxonomiesViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const options = taxonomiesQueryOptions(siteId);
  const { data: taxonomies } = useSuspenseQuery(options);
  const { data: site } = useSuspenseQuery(siteQueryOptions());
  const [isCreating, setIsCreating] = useState(false);
  const [toRename, setToRename] = useState<TaxonomyRecord | null>(null);
  const [toDelete, setToDelete] = useState<TaxonomyRecord | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: options.queryKey });

  const deleteMutation = useMutation({
    mutationFn: (taxonomy: TaxonomyRecord) => deleteTaxonomy(taxonomy.id),
    onSuccess: (_, taxonomy) => {
      invalidate();
      toast(
        t('taxonomies.deleted', { name: firstNamed(taxonomy.name) }),
        'success',
      );
    },
    onError: (caught: unknown) =>
      setDeleteError(actionErrorMessage(caught, t('taxonomies.deleteFailed'))),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('taxonomies.title')}
        description={t('taxonomies.subtitle')}
        actions={
          <Button onClick={() => setIsCreating(true)}>
            {t('taxonomies.new')}
          </Button>
        }
      />
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}

      {taxonomies.length === 0 ? (
        // "No category yet." over a concept nobody is born knowing. It
        // says what a category IS, with an example, and makes one.
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
          <p className="text-sm text-muted-foreground">
            {t('taxonomies.emptyExplainer')}
          </p>
          <Button variant="outline" onClick={() => setIsCreating(true)}>
            {t('taxonomies.new')}
          </Button>
        </div>
      ) : (
        taxonomies.map((taxonomy) => (
          <section
            key={taxonomy.id}
            // The address of a category: its terms' pages link back here.
            id={taxonomy.id}
            aria-labelledby={`taxonomy-${taxonomy.id}`}
            className="flex scroll-mt-4 flex-col gap-3 rounded-lg border p-4"
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2
                  id={`taxonomy-${taxonomy.id}`}
                  className="truncate text-base font-semibold"
                >
                  {firstNamed(taxonomy.name) || t('taxonomies.unnamed')}
                </h2>
                <code className="text-xs text-muted-foreground">
                  {taxonomy.prefix
                    ? `/${taxonomy.prefix}/…`
                    : t('taxonomies.atRoot')}
                </code>
                {/* Not changeable, and said: the addresses of the terms
                    that exist would stop answering. */}
                <p className="text-xs text-muted-foreground">
                  {t('taxonomies.prefixFixed')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setToRename(taxonomy)}
                >
                  <Pencil />
                  {t('taxonomies.rename')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeleteError('');
                    setToDelete(taxonomy);
                  }}
                >
                  <Trash2 />
                  {t('taxonomies.delete')}
                </Button>
              </div>
            </header>
            <TermTreeEditor
              taxonomy={taxonomy}
              defaultLocale={site.defaultLocale}
            />
          </section>
        ))
      )}

      <NewTaxonomyDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        onCreate={async (input) => {
          const created = await createTaxonomy({
            siteId,
            name: { [site.defaultLocale]: input.name },
            ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
            hierarchical: input.hierarchical,
          });
          invalidate();
          toast(
            t('taxonomies.created', { name: firstNamed(created.name) }),
            'success',
          );
        }}
      />
      <PromptDialog
        open={toRename !== null}
        onOpenChange={(open) => !open && setToRename(null)}
        title={t('taxonomies.renameDialog.title')}
        label={t('taxonomies.nameLabel')}
        initialValue={toRename ? firstNamed(toRename.name) : ''}
        submitLabel={t('taxonomies.rename')}
        busyLabel={t('common.saving')}
        onSubmit={async (name) => {
          if (!toRename) return;
          await updateTaxonomy(toRename.id, {
            name: { ...toRename.name, [site.defaultLocale]: name },
          });
          invalidate();
          toast(t('taxonomies.renamed', { name }), 'success');
        }}
      />
      {toDelete && (
        <DeleteTaxonomyDialog
          taxonomy={toDelete}
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            deleteMutation.mutate(toDelete);
            setToDelete(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Deleting a category takes its terms with it, and every page stops being
 * filed under them — the pages themselves are untouched (ADR-0064). The
 * question names the category and says how many terms go: "delete this?"
 * and "delete this, with its forty terms?" are different decisions.
 */
function DeleteTaxonomyDialog({
  taxonomy,
  onCancel,
  onConfirm,
}: {
  taxonomy: TaxonomyRecord;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  // The terms the tree above has already fetched: the same cache entry.
  const { data: terms } = useQuery(termsQueryOptions(taxonomy.id));
  const count = terms?.length;
  return (
    <ConfirmActionDialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={t('taxonomies.deleteDialog.title', {
        name: firstNamed(taxonomy.name),
      })}
      description={[
        count === undefined
          ? null
          : count === 0
            ? t('taxonomies.deleteDialog.noTerms')
            : t('taxonomies.deleteDialog.terms', { count }),
        t('taxonomies.deleteDialog.description'),
      ]
        .filter((sentence) => sentence !== null)
        .join(' ')}
      onConfirm={onConfirm}
    />
  );
}
