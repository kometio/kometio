import {
  collectSectionReferences,
  resolveSectionBlocks,
  type PageContent,
} from '@kometio/shared-types';
import type { ReusableSectionRepositoryPort } from '@kometio/ports';

export interface ResolveSectionInstancesDeps {
  reusableSectionRepository: ReusableSectionRepositoryPort;
}

/**
 * Expands every `Section` block in one or more content trees into the
 * section's PUBLISHED blocks (docs/adr/0059).
 *
 * This is the mechanism the whole feature rests on. A page's published
 * snapshot stores the reference, never the blocks — so publishing a
 * section changes all eight pages that use it, with none of them
 * republished. Freezing the blocks into the snapshot instead would have
 * reproduced exactly the problem the section exists to solve.
 *
 * `publishedContent` and never `content`: a section's draft is as private
 * as a page's, and the alternative is that half-finished edits appear on
 * every page using it as they are typed.
 *
 * One batched read for all of them, and the same combined pass over page
 * content plus header plus footer that `resolvePageContentReferences`
 * does — a section referenced from two of the three costs one lookup.
 */
export async function resolveSectionInstances(
  deps: ResolveSectionInstancesDeps,
  tenantId: string,
  contents: PageContent[],
): Promise<PageContent[]> {
  const publishedById = await loadPublishedSections(deps, tenantId, contents);
  if (publishedById.size === 0) {
    return contents;
  }
  return contents.map((content) =>
    resolveSectionBlocks(content, publishedById),
  );
}

/**
 * The same expansion for one tree — what search indexing wants: a page's
 * words, with its sections' words in them.
 */
export async function resolveSectionInstancesIn(
  deps: ResolveSectionInstancesDeps,
  tenantId: string,
  content: PageContent,
): Promise<PageContent> {
  const publishedById = await loadPublishedSections(deps, tenantId, [content]);
  return publishedById.size === 0
    ? content
    : resolveSectionBlocks(content, publishedById);
}

/**
 * The published blocks of every section these trees reference, by id.
 *
 * Its own function because the canvas needs the same thing without the
 * expansion: the editor renders ONE block at a time through
 * render-block-fragment, and a `Section` block handed to it alone has no
 * children — the page it belongs to is what knows them. The preview
 * payload carries this map so that endpoint can graft them itself, instead
 * of answering "this section has not been published yet" for a section
 * that plainly has.
 */
export async function loadPublishedSections(
  deps: ResolveSectionInstancesDeps,
  tenantId: string,
  contents: PageContent[],
): Promise<Map<string, PageContent>> {
  const referenced = collectSectionReferences(contents);
  if (referenced.size === 0) {
    return new Map();
  }
  const sections = await deps.reusableSectionRepository.findByIds(tenantId, [
    ...referenced,
  ]);
  const publishedById = new Map<string, PageContent>();
  for (const section of sections) {
    if (section.publishedContent) {
      publishedById.set(section.id, section.publishedContent);
    }
  }
  return publishedById;
}
