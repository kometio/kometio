import type {
  PageContent,
  SiteLayoutSectionKind,
  SiteLayoutSectionStatus,
} from '@kometio/shared-types';

export type { SiteLayoutSectionKind, SiteLayoutSectionStatus };

export interface SiteLayoutSectionProps {
  id: string;
  tenantId: string;
  siteId: string;
  locale: string;
  kind: SiteLayoutSectionKind;
  status: SiteLayoutSectionStatus;
  content: PageContent;
  publishedContent: PageContent | null;
  // Only meaningful for kind='header' (it stays pinned at the top while
  // scrolling) — there is no domain-level constraint preventing it for
  // 'footer', it is simply that editor-app does not expose the control
  // there and apps/public-site never reads it for the footer. It is not
  // part of versioning (site-layout-section-version.ts stays content only):
  // it is a display setting, not published content.
  sticky: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSiteLayoutSectionProps {
  id: string;
  tenantId: string;
  siteId: string;
  locale: string;
  kind: SiteLayoutSectionKind;
  // A starting point copied from the content of the header or footer
  // already published in the site's default locale (docs/adr/0018) — the
  // same "copy-on-translate" philosophy as createPageTranslation, so
  // enabling a new language does not force rebuilding the header from
  // scratch. `sticky` follows the same logic: if the IT header is sticky,
  // the EN header freshly created by copy starts out sticky too.
  content?: PageContent;
  sticky?: boolean;
  now?: Date;
}

/**
 * A pure entity, with no dependency on Postgres, Express or Puck. Unlike
 * Page it has no `groupId`/`slug`/`seoMeta`: the header and footer have no
 * public URL of their own, living at the level of (tenant, site, locale,
 * kind) rather than as visitable pages (docs/adr/0018).
 */
export class SiteLayoutSection {
  private constructor(private props: SiteLayoutSectionProps) {}

  static create(input: CreateSiteLayoutSectionProps): SiteLayoutSection {
    const now = input.now ?? new Date();
    return new SiteLayoutSection({
      id: input.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      locale: input.locale,
      kind: input.kind,
      status: 'draft',
      content: input.content ?? [],
      publishedContent: null,
      sticky: input.sticky ?? false,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromProps(props: SiteLayoutSectionProps): SiteLayoutSection {
    return new SiteLayoutSection({ ...props });
  }

  toProps(): SiteLayoutSectionProps {
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

  get locale(): string {
    return this.props.locale;
  }

  get kind(): SiteLayoutSectionKind {
    return this.props.kind;
  }

  get status(): SiteLayoutSectionStatus {
    return this.props.status;
  }

  get content(): PageContent {
    return this.props.content;
  }

  get publishedContent(): PageContent | null {
    return this.props.publishedContent;
  }

  get sticky(): boolean {
    return this.props.sticky;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Updates the draft. The published version is not touched. */
  saveDraft(content: PageContent, now: Date = new Date()): void {
    this.props.content = content;
    this.props.updatedAt = now;
  }

  /** Promuove il draft corrente a versione pubblicata. */
  publish(now: Date = new Date()): void {
    this.props.publishedContent = this.props.content;
    this.props.status = 'published';
    this.props.updatedAt = now;
  }

  /**
   * Restores the draft to a previous version's content. It does not
   * republish automatically, the same invariant as Page.restoreContent.
   */
  restoreContent(content: PageContent, now: Date = new Date()): void {
    this.props.content = content;
    this.props.updatedAt = now;
  }

  /**
   * It is not "content": it does not go through draft/publish and generates
   * no version row (it is a display setting, not text or blocks an editor
   * would want to be able to restore) — it takes effect immediately, even
   * while the status stays 'draft'.
   */
  setSticky(sticky: boolean, now: Date = new Date()): void {
    this.props.sticky = sticky;
    this.props.updatedAt = now;
  }
}
