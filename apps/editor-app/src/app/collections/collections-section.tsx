import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { actionErrorMessage } from '../../lib/http-client';
import {
  createCollection,
  deleteCollection,
  updateCollection,
  type CollectionRecord,
} from '../../lib/collections-api-client';
import { DEFAULT_COLLECTION_ICON } from './collection-icons';
import { CollectionIconSelect } from './collection-icon-select';
import { CollectionRow } from './collection-row';
import {
  collectionsQueryKey,
  collectionsQueryOptions,
} from './collections-queries';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { publishedTemplatesQueryOptions } from '../sections/reusable-sections-queries';
import { InlineError } from '../../components/ui/inline-error';
import { SkeletonRows } from '../../components/ui/skeleton';
import { SettingsSectionHeader } from '../settings/settings-section';
import { useToast } from '../shell/toast-provider';

export interface CollectionsSectionProps {
  siteId: string;
}

/**
 * Where the collections of the editor are created and named.
 *
 * A section of the settings rather than a screen of its own: making a
 * collection is something a site does once or twice, and a permanent entry
 * in the sidebar for it would sit next to the collections it produces,
 * which is where the confusion would start.
 */
export function CollectionsSection({ siteId }: CollectionsSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const headingId = useId();
  const queryClient = useQueryClient();
  const { data: collections } = useQuery(collectionsQueryOptions(siteId));
  const { data: templates = [] } = useQuery(
    publishedTemplatesQueryOptions(siteId),
  );
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(DEFAULT_COLLECTION_ICON);
  const newName = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [pendingDeletion, setPendingDeletion] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: collectionsQueryKey(siteId) });

  const create = useMutation({
    mutationFn: () => createCollection({ siteId, name: name.trim(), icon }),
    onSuccess: async (created) => {
      setName('');
      setIcon(DEFAULT_COLLECTION_ICON);
      await invalidate();
      toast(t('collections.created', { name: created.name }), 'success');
    },
    onError: (err) =>
      setError(actionErrorMessage(err, t('collections.actionFailed'))),
  });

  // The row says what went wrong with its own save, so nothing is caught
  // here: a refusal reaches it.
  const save = useMutation({
    mutationFn: (input: {
      id: string;
      changes: Partial<Pick<CollectionRecord, 'name' | 'icon'>>;
    }) => updateCollection(input.id, input.changes),
    onSuccess: async (updated) => {
      await invalidate();
      toast(t('collections.saved', { name: updated.name }), 'success');
    },
  });

  const setDefaultTemplate = useMutation({
    mutationFn: (input: { id: string; defaultTemplateId: string | null }) =>
      updateCollection(input.id, {
        defaultTemplateId: input.defaultTemplateId,
      }),
    onSuccess: async (updated) => {
      await invalidate();
      toast(
        t('collections.templateChanged', { name: updated.name }),
        'success',
      );
    },
    onError: (err) =>
      setError(actionErrorMessage(err, t('collections.actionFailed'))),
  });

  const remove = useMutation({
    mutationFn: (target: { id: string; name: string }) =>
      deleteCollection(target.id),
    onSuccess: async (_deleted, target) => {
      await invalidate();
      toast(t('collections.deleted', { name: target.name }), 'success');
    },
    onError: (err) =>
      setError(actionErrorMessage(err, t('collections.actionFailed'))),
  });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-8">
      <SettingsSectionHeader
        id={headingId}
        title={t('settings.nav.items.collections')}
        description={t('collections.dialog.description')}
      />
      <div className="flex flex-col gap-4">
        {error && <InlineError>{error}</InlineError>}
        {collections === undefined ? (
          <SkeletonRows rows={3} label={t('common.loading')} />
        ) : collections.length === 0 ? (
          // "No collection yet" says nothing to somebody who has never met
          // one: what it is, and the way to make the first.
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-sm text-muted-foreground">
              {t('collections.emptyExplainer')}
            </p>
            <Button variant="outline" onClick={() => newName.current?.focus()}>
              {t('collections.dialog.newLabel')}
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {collections.map((collection) => (
              <CollectionRow
                key={collection.id}
                collection={collection}
                templates={templates}
                onSave={(changes) =>
                  save.mutateAsync({ id: collection.id, changes })
                }
                onTemplateChange={(defaultTemplateId) =>
                  setDefaultTemplate.mutate({
                    id: collection.id,
                    defaultTemplateId,
                  })
                }
                onDelete={() =>
                  setPendingDeletion({
                    id: collection.id,
                    name: collection.name,
                  })
                }
              />
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            if (name.trim()) create.mutate();
          }}
        >
          <Label htmlFor="new-collection-name">
            {t('collections.dialog.newLabel')}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="new-collection-name"
              ref={newName}
              value={name}
              placeholder={t('collections.dialog.newPlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              <Plus className="size-4" />
              {t('collections.dialog.create')}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-48">
            <Label htmlFor="new-collection-icon">
              {t('collections.dialog.iconLabel')}
            </Label>
            <CollectionIconSelect
              id="new-collection-icon"
              value={icon}
              onChange={setIcon}
            />
          </div>
        </form>
        {pendingDeletion && (
          <ConfirmActionDialog
            open
            onOpenChange={(next) => !next && setPendingDeletion(null)}
            title={t('collections.dialog.confirmDelete.title')}
            description={t('collections.dialog.confirmDelete.description', {
              name: pendingDeletion.name,
            })}
            onConfirm={() => {
              const target = pendingDeletion;
              setPendingDeletion(null);
              remove.mutate(target);
            }}
          />
        )}
      </div>
    </section>
  );
}
