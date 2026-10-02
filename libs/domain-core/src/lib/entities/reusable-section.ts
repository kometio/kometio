import type {
  ExposedFields,
  PageContent,
  ReusableSectionKind,
  ReusableSectionStatus,
} from '@kometio/shared-types';

export type { ReusableSectionStatus };

export interface ReusableSectionProps {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  kind: ReusableSectionKind;
  status: ReusableSectionStatus;
  content: PageContent;
  publishedContent: PageContent | null;
  exposedFields: ExposedFields;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReusableSectionProps {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  kind: ReusableSectionKind;
  /** A starting point — the blocks selected on a page, when the section was made out of them. */
  content?: PageContent;
  createdBy?: string | null;
  now?: Date;
}

/**
 * A strip of blocks built once and used on many pages (docs/adr/0059).
 *
 * The draft/publish cycle is not a copy of the page's for symmetry: it is
 * the mechanism. A page's published snapshot stores only the REFERENCE to
 * a `shared` section, and the render resolves `publishedContent` — so
 * publishing here changes every page using it, with none of them
 * republished. Without the cycle, the alternative would be that a
 * half-finished draft went live the moment it was typed.
 *
 * It is not a `SiteLayoutSection` with a different `kind`, though the two
 * look alike: a header exists at most once per (site, locale) and is
 * applied automatically, while this one is placed by hand, any number of
 * times, and carries the rule about what an instance may change.
 */
export class ReusableSection {
  private constructor(private props: ReusableSectionProps) {}

  static create(input: CreateReusableSectionProps): ReusableSection {
    const now = input.now ?? new Date();
    return new ReusableSection({
      id: input.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      name: input.name,
      kind: input.kind,
      status: 'draft',
      content: input.content ?? [],
      publishedContent: null,
      exposedFields: {},
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromProps(props: ReusableSectionProps): ReusableSection {
    return new ReusableSection({ ...props });
  }

  toProps(): ReusableSectionProps {
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

  get name(): string {
    return this.props.name;
  }

  get kind(): ReusableSectionKind {
    return this.props.kind;
  }

  get status(): ReusableSectionStatus {
    return this.props.status;
  }

  get content(): PageContent {
    return this.props.content;
  }

  get publishedContent(): PageContent | null {
    return this.props.publishedContent;
  }

  get exposedFields(): ExposedFields {
    return this.props.exposedFields;
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

  /** Updates the draft. Never touches what is live. */
  saveDraft(content: PageContent, now: Date = new Date()): void {
    this.props.content = content;
    this.props.updatedAt = now;
  }

  rename(name: string, now: Date = new Date()): void {
    this.props.name = name;
    this.props.updatedAt = now;
  }

  /**
   * Which fields an instance may change. Not versioned and not part of
   * publish: it is a rule about editing, not content — and an agency that
   * decides to unlock one more field should not have to republish the
   * section for the client to see the input appear.
   */
  setExposedFields(exposedFields: ExposedFields, now: Date = new Date()): void {
    this.props.exposedFields = exposedFields;
    this.props.updatedAt = now;
  }

  /** Promotes the current draft to the published version. */
  publish(now: Date = new Date()): void {
    this.props.publishedContent = this.props.content;
    this.props.status = 'published';
    this.props.updatedAt = now;
  }

  /**
   * Restores the draft to a previous version's content, without
   * republishing — the same invariant as Page.restoreContent and
   * SiteLayoutSection.restoreContent.
   */
  restoreContent(content: PageContent, now: Date = new Date()): void {
    this.props.content = content;
    this.props.updatedAt = now;
  }
}
