import type { LocalizedText } from '@kometio/shared-types';

export interface TaxonomyProps {
  id: string;
  tenantId: string;
  siteId: string;
  /** The URL prefix its terms answer under, or `null` for the site root (docs/adr/0064). */
  prefix: string | null;
  name: LocalizedText;
  hierarchical: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaxonomyProps {
  id: string;
  tenantId: string;
  siteId: string;
  prefix: string | null;
  name: LocalizedText;
  hierarchical?: boolean;
  order?: number;
  now?: Date;
}

/**
 * One dimension a site classifies along — "Category", "Family", "Tag"
 * (docs/adr/0064).
 *
 * `prefix` is the column the schema calls `slug`, renamed on the way in:
 * every other `slug` in this codebase is the last segment of an address,
 * and this one is the first. A taxonomy has no address of its own at all
 * — only its terms do.
 */
export class Taxonomy {
  private constructor(private props: TaxonomyProps) {}

  static create(input: CreateTaxonomyProps): Taxonomy {
    const now = input.now ?? new Date();
    return new Taxonomy({
      id: input.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      prefix: input.prefix,
      name: input.name,
      // Nesting by default: a dimension that turns out to be flat costs
      // nothing, while discovering halfway through that terms cannot nest
      // means rebuilding the tree by hand.
      hierarchical: input.hierarchical ?? true,
      order: input.order ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromProps(props: TaxonomyProps): Taxonomy {
    return new Taxonomy({ ...props });
  }

  toProps(): TaxonomyProps {
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

  get prefix(): string | null {
    return this.props.prefix;
  }

  get name(): LocalizedText {
    return this.props.name;
  }

  get hierarchical(): boolean {
    return this.props.hierarchical;
  }

  get order(): number {
    return this.props.order;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(name: LocalizedText, now: Date = new Date()): void {
    this.props.name = name;
    this.props.updatedAt = now;
  }

  /**
   * Moves every one of this dimension's terms to a new prefix at once —
   * which is why the repository has to rewrite their address rows in the
   * same transaction (docs/adr/0064).
   */
  setPrefix(prefix: string | null, now: Date = new Date()): void {
    this.props.prefix = prefix;
    this.props.updatedAt = now;
  }

  setOrder(order: number, now: Date = new Date()): void {
    this.props.order = order;
    this.props.updatedAt = now;
  }

  /**
   * Turning nesting off does not flatten the terms that already nest —
   * that would silently move content. The use case refuses instead, so
   * the person decides what happens to the tree.
   */
  setHierarchical(hierarchical: boolean, now: Date = new Date()): void {
    this.props.hierarchical = hierarchical;
    this.props.updatedAt = now;
  }
}
