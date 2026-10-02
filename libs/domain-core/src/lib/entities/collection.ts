export interface CollectionProps {
  id: string;
  tenantId: string;
  siteId: string;
  /** The label of the screen it adds to the editor — plain text, read by the people who administer the site, not by its visitors. */
  name: string;
  /** A lucide icon name, so its sidebar entry looks like the ones the product ships with. */
  icon: string;
  order: number;
  /**
   * The template a new page in this collection starts from, preselected
   * in the New page dialog — or `null` to start blank (docs/adr/0072).
   * A suggestion the person creating the page can change, not a rule.
   */
  defaultTemplateId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCollectionProps {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  icon?: string;
  order?: number;
  now?: Date;
}

/** What a collection's entry shows when nobody picked an icon. */
export const DEFAULT_COLLECTION_ICON = 'newspaper';

/**
 * A named section of the editor holding pages of one kind — News,
 * Events, Case studies — each with a menu entry of its own.
 *
 * Underneath, an article IS a page: same storage, same draft and publish
 * per language, same version history, same addresses, same editor. What
 * a collection changes is who lists it and how — a flat list, newest
 * first, on a screen of its own, instead of a row in the site's tree.
 * Three hundred news items filed into a page tree make both unreadable,
 * and that is the whole reason this exists.
 *
 * It deliberately carries no behaviour yet, only identity. Every
 * collection is a flat list ordered by publication date; the day one
 * needs a different order, this is the entity it belongs to. What it
 * must never grow is FIELDS of its own — a collection that can add a
 * field is a content-type engine, and custom fields are the Block SDK's
 * job (see ADR-0041). A default template is not such a field: it decides
 * which blocks a new page STARTS with, and the page owns them from then
 * on, exactly as if somebody had inserted them by hand.
 */
export class Collection {
  private constructor(private props: CollectionProps) {}

  static create(input: CreateCollectionProps): Collection {
    const now = input.now ?? new Date();
    return new Collection({
      id: input.id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      name: input.name,
      icon: input.icon || DEFAULT_COLLECTION_ICON,
      order: input.order ?? 0,
      defaultTemplateId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromProps(props: CollectionProps): Collection {
    return new Collection({ ...props });
  }

  toProps(): CollectionProps {
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

  get icon(): string {
    return this.props.icon;
  }

  get order(): number {
    return this.props.order;
  }

  get defaultTemplateId(): string | null {
    return this.props.defaultTemplateId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(name: string, now: Date = new Date()): void {
    this.props.name = name;
    this.props.updatedAt = now;
  }

  /** An empty icon falls back rather than being stored: a sidebar entry with no icon is a hole in a list of eleven. */
  changeIcon(icon: string, now: Date = new Date()): void {
    this.props.icon = icon || DEFAULT_COLLECTION_ICON;
    this.props.updatedAt = now;
  }

  /** Whether the id names a template of this site is the use case's to check: the entity cannot see the sections. */
  setDefaultTemplate(templateId: string | null, now: Date = new Date()): void {
    this.props.defaultTemplateId = templateId;
    this.props.updatedAt = now;
  }

  reorder(order: number, now: Date = new Date()): void {
    this.props.order = order;
    this.props.updatedAt = now;
  }
}
