/** One entry of a WordPress export, whatever kind of thing it is. */
export interface WordPressExportItem {
  postId: number | null;
  postType: string;
  status: string;
  title: string;
  slug: string;
  parentId: number | null;
  menuOrder: number;
  link: string;
  content: string;
  excerpt: string;
  /** Keys only — an export's postmeta values are most of its weight, and the adapter keeps a value only when asked. */
  metaKeys: string[];
  metaValues: Record<string, string>;
  terms: { taxonomy: string; slug: string; name: string }[];
  attachmentUrl: string;
}

export interface WordPressExportChannel {
  title: string;
  baseSiteUrl: string;
  baseBlogUrl: string;
  terms: {
    taxonomy: string;
    slug: string;
    name: string;
    parentSlug: string;
  }[];
  /**
   * The site's own custom-field definitions, as its export describes
   * them — what makes an import work on a site nobody has configured
   * anything for.
   *
   * It comes back with the channel rather than from a second call
   * because it is assembled from the same entries: the definitions are
   * rows in the export like any other, and reading a 314 MB file twice
   * to get them would be reading it twice.
   *
   * Empty when the site has no such fields, or registers them in its
   * theme's code rather than in its database — which is common, and is
   * why nothing here may assume a block is described.
   */
  acfSchema: AcfSchema;
}

/**
 * Reading a WordPress export, one entry at a time.
 *
 * A callback rather than a returned list, and that is the contract: a real
 * export is hundreds of megabytes (314 MB on the first client site this
 * was measured against, 43 597 entries), so nothing may assume it fits in
 * memory. An implementation streams; a caller counts.
 */
export interface WordPressExportReaderPort {
  read(
    filePath: string,
    onItem: (item: WordPressExportItem) => void,
    options?: { keepMetaValues?: readonly string[] },
  ): Promise<WordPressExportChannel>;
}

/** What a field group is attached to — the rule ACF calls its `location`. */
export interface AcfTarget {
  kind: 'block' | 'postType' | 'taxonomy' | 'optionsPage' | 'other';
  /** `acf/hero`, `acme_prodotto`, … */
  value: string;
}

export interface AcfField {
  /** `field_0655acfa4dd74` — how a value refers back to its definition. */
  key: string;
  /** `slides`, `ac_product_info` — what the value is keyed by. */
  name: string;
  /** What a person called it: "Product Info". */
  label: string;
  /** `text`, `wysiwyg`, `image`, `repeater`, `group`, `select`, … */
  type: string;
  /** Sub-fields, for the types that hold other fields. Empty otherwise. */
  children: AcfField[];
}

export interface AcfFieldGroup {
  title: string;
  targets: AcfTarget[];
  fields: AcfField[];
}

export interface AcfSchema {
  groups: AcfFieldGroup[];
  /** The fields of an ACF block, by block name (`acf/hero`). Empty when the export does not describe it. */
  forBlock(blockName: string): AcfField[];
  /** The fields attached to a post type. */
  forPostType(postType: string): AcfField[];
}
