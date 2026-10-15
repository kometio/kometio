import type {
  FormField,
  PageContent,
  StarterId,
  StarterLanguage,
} from '@kometio/shared-types';

/** What a starter may refer to inside a block's props, by the key it gave it. */
export type StarterReferenceKind = 'page' | 'form' | 'taxonomy' | 'term';

export interface StarterForm {
  key: string;
  name: string;
  fields: FormField[];
}

export interface StarterCollection {
  key: string;
  name: string;
  /** A Lucide name, as the editor's own picker stores one. */
  icon: string;
}

export interface StarterTerm {
  key: string;
  name: string;
}

export interface StarterTaxonomy {
  key: string;
  name: string;
  terms: StarterTerm[];
}

export interface StarterPage {
  key: string;
  /** The key of the page this one sits under; absent for a page at the top. */
  parent?: string;
  slug: string;
  title: string;
  /** The search result's description (`seoMeta.description`). */
  description: string;
  /** Blocks with no ids: they are given theirs when the page is made. */
  content: PageContent;
  /** The key of the section of the editor this page is listed in. */
  collection?: string;
  /** The keys of the terms it is filed under. */
  terms?: string[];
}

/**
 * Everything a starter makes, in one language.
 *
 * `pages[0]` is the home page: it takes the place of the one the wizard
 * made, which is the page the site's address opens. Every page after it comes
 * after the page it sits under, so a parent is there when its child is made.
 */
export interface StarterContent {
  header: PageContent;
  footer: PageContent;
  forms: StarterForm[];
  collections: StarterCollection[];
  taxonomies: StarterTaxonomy[];
  pages: StarterPage[];
}

/** What a starter is told about the site it is made for. */
export interface StarterContext {
  siteName: string;
}

export interface Starter {
  id: StarterId;
  /** The bundled theme the starter was designed for. */
  themeName: string;
  /** Written per language, as a function of the site: the header carries its name. */
  content: Record<StarterLanguage, (context: StarterContext) => StarterContent>;
}
