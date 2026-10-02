import { useState, type ReactElement } from 'react';
import type { Block } from '@kometio/shared-types';
import type { BlockDescriptor } from '@kometio/block-registry';
import {
  createReusableSection,
  publishReusableSection,
} from '../../lib/reusable-sections-api-client';
import { useTranslation } from '../../lib/use-translation';
import { canPlace, locateBlock } from './use-block-tree';
import { findBlockById } from '@kometio/shared-types';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import { PromptDialog } from '../common/prompt-dialog';

export interface UseMakeReusableSectionParams {
  siteId: string | undefined;
  selectedBlock: Block | null;
  localBlocks: Block[];
  registry: BlockDescriptor[];
  /** Swaps the selected block for the instance, as one undoable step. */
  handleReplaceSelected: (replacement: Block & { id: string }) => void;
}

/**
 * "This strip belongs on other pages too" (docs/adr/0059).
 *
 * Creates a SHARED section from the selected block, publishes it, and
 * replaces the block with an instance pointing at it. Published straight
 * away rather than left as a draft: the page it was taken from would
 * otherwise lose that strip until somebody published the section, which
 * reads as the button having broken the page.
 *
 * `openDialog` asks for the name, in `dialog`. A name already taken is
 * said under the name, which stays typed: it was a browser prompt and
 * then an alert, and the name was gone.
 *
 * `undefined` without a site to create the section in, and where the
 * instance could not stand: the block is swapped for a Section in place,
 * and a container that only takes one kind of child — the testimonials of
 * a Testimonials, the tracks of a Columns — may not hold one. The page's
 * own top level takes anything.
 */
export function useMakeReusableSection({
  siteId,
  selectedBlock,
  localBlocks,
  registry,
  handleReplaceSelected,
}: UseMakeReusableSectionParams):
  { openDialog: () => void; dialog: ReactElement } | undefined {
  const { t } = useTranslation();
  const [isNaming, setIsNaming] = useState(false);

  const parentId = selectedBlock?.id
    ? locateBlock(localBlocks, selectedBlock.id)?.parentId
    : null;
  const parent = parentId ? findBlockById(localBlocks, parentId) : null;
  if (!siteId || (parent && !canPlace(registry, parent.type, 'Section'))) {
    return undefined;
  }

  async function makeReusable(name: string): Promise<void> {
    if (!siteId || !selectedBlock?.id) return;
    const created = await createReusableSection({
      siteId,
      name,
      kind: 'shared',
      content: [selectedBlock],
    });
    await publishReusableSection(created.id);
    handleReplaceSelected({
      id: crypto.randomUUID(),
      type: 'Section',
      props: {
        section: { sectionId: created.id, sectionName: created.name },
      },
    });
  }

  return {
    openDialog: () => setIsNaming(true),
    dialog: (
      <PromptDialog
        open={isNaming}
        onOpenChange={setIsNaming}
        title={t('sections.makeReusable')}
        label={t('sections.nameLabel')}
        submitLabel={t('sections.makeReusableSubmit')}
        busyLabel={t('sections.makeReusableBusy')}
        onSubmit={makeReusable}
        errorMessage={(caught) =>
          caught instanceof ApiError && caught.status === 409
            ? t('sections.nameTaken')
            : actionErrorMessage(caught, t('sections.makeReusableFailed'))
        }
      />
    ),
  };
}
