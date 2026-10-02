import type { PageContent } from '@kometio/shared-types';
import type { EditContext } from './edit-context';

export interface PageGroupProps {
  id: string;
  tenantId: string;
  siteId: string;
  /** A hierarchy SHARED across every language of this group — unlike the old `Page.parentId` (which was per-locale), it makes no sense for two languages of the same page to live at different points in the site's tree. */
  parentId: string | null;
  /** The position among siblings, shared for the same reason as `parentId` — see setPageOrder's own comment about the old model. */
  order: number;
  /** Which section of the editor lists this page, or `null` for a page — see the Collection entity. */
  collectionId: string | null;
  /** The canonical block tree. For a field marked `translatable` (see FieldDescriptor in @kometio/block-registry), the value here is the site's default language's — the fallback used until a PageTranslation has an override of its own (see mergeTranslatedContent). */
  content: PageContent;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The last person to change anything here, resolved to a name only for display — see PageGroupListItem. */
  updatedBy: string | null;
  /**
   * When the shared structure last changed, as opposed to `updatedAt`,
   * which also moves for a reorder or a reparenting.
   *
   * The distinction is what lets a published page say honestly whether
   * it has changes waiting: moving a page in the tree needs no publish
   * (the public tree is read live), so counting that move as a pending
   * change would raise an alarm nobody can clear.
   */
  contentUpdatedAt: Date;
}

export interface CreatePageGroupProps {
  id: string;
  tenantId: string;
  siteId: string;
  parentId?: string | null;
  content?: PageContent;
  order?: number;
  collectionId?: string | null;
  createdBy?: string | null;
  now?: Date;
}

/**
 * A pure entity, in the same style as Page (which this and PageTranslation
 * take the place of — see ADR-0017's supersession). It owns the structure
 * SHARED across every language: adding, removing or reordering a block here
 * applies to every linked PageTranslation (not an "unlinked" one, see
 * PageTranslation.isDiverged) in one go — which is the whole point of the
 * field-level i18n redesign, eliminating the structural drift the old model
 * could only report and never prevent.
 */
export class PageGroup {
  private constructor(private props: PageGroupProps) {}

  static create(input: CreatePageGroupProps): PageGroup {
    const now = input.now ?? new Date();
    return new PageGroup({
      id: input.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      parentId: input.parentId ?? null,
      order: input.order ?? 0,
      collectionId: input.collectionId ?? null,
      content: input.content ?? [],
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy ?? null,
      contentUpdatedAt: now,
    });
  }

  static fromProps(props: PageGroupProps): PageGroup {
    return new PageGroup({ ...props });
  }

  toProps(): PageGroupProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get siteId(): string {
    return this.props.siteId;
  }

  get parentId(): string | null {
    return this.props.parentId;
  }

  get order(): number {
    return this.props.order;
  }

  get collectionId(): string | null {
    return this.props.collectionId;
  }

  get content(): PageContent {
    return this.props.content;
  }

  get createdBy(): string | null {
    return this.props.createdBy;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get updatedBy(): string | null {
    return this.props.updatedBy;
  }

  get contentUpdatedAt(): Date {
    return this.props.contentUpdatedAt;
  }

  /** Reassigns the parent in the hierarchy — the same discipline as Page.setParent: cycle and same-site validation belong to the use case (which has repository access), since the pure entity cannot walk the chain itself. */
  setParent(parentId: string | null, edit: EditContext): void {
    this.props.parentId = parentId;
    this.touch(edit);
  }

  /** Reassigns the position among siblings — the same discipline as Page.reorder: the permutation's validity is the use case's business, not the entity's. */
  reorder(order: number, edit: EditContext): void {
    this.props.order = order;
    this.touch(edit);
  }

  /**
   * Moves this page into a section of the editor, or back out of one
   * (`null`).
   *
   * It changes which screen lists the page and in what order, and
   * nothing else: not its address, not its place in the site's tree, not
   * what a visitor sees. An article and a page are the same object.
   */
  moveToCollection(collectionId: string | null, edit: EditContext): void {
    this.props.collectionId = collectionId;
    this.touch(edit);
  }

  /** Updates the shared structure (the draft) — it propagates to every linked PageTranslation, never to unlinked ones (see PageTranslation.isDiverged). */
  saveContent(content: PageContent, edit: EditContext): void {
    this.props.content = content;
    this.props.contentUpdatedAt = this.touch(edit);
  }

  /** Records the author and the moment of a change, and hands back that moment for whoever also needs it. */
  private touch(edit: EditContext): Date {
    const now = edit.now ?? new Date();
    this.props.updatedAt = now;
    this.props.updatedBy = edit.by;
    return now;
  }
}
