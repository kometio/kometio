import type {
  TermRecord,
  UpdateTermInput,
} from '../../lib/taxonomies-api-client';

/** What the term's page holds while it is being edited: one entry per language of the site. */
export interface TermFormValues {
  names: Record<string, string>;
  slugs: Record<string, string>;
  descriptions: Record<string, string>;
  /** `''` is the first level. */
  parentId: string;
  noindex: boolean;
  landingPageGroupId: string | null;
}

/** Every language of the site gets a field, whether or not the term has anything in it yet. */
function perLocale(
  locales: readonly string[],
  source: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, source[locale] ?? '']),
  );
}

export function termToFormValues(
  term: TermRecord,
  locales: readonly string[],
): TermFormValues {
  return {
    names: perLocale(locales, term.name),
    slugs: perLocale(locales, term.slugs),
    descriptions: perLocale(locales, term.description),
    parentId: term.parentId ?? '',
    noindex: term.noindex,
    landingPageGroupId: term.landingPageGroupId,
  };
}

/**
 * What the form says about each language laid over what the term already
 * had. A language left empty has nothing — the key is absent, as an emptied
 * slug is — rather than an empty string standing for a name or a text that
 * is not there.
 */
function overlay(
  base: Record<string, string>,
  values: Record<string, string>,
): Record<string, string> {
  const merged = { ...base };
  for (const [locale, value] of Object.entries(values)) {
    const trimmed = value.trim();
    if (trimmed === '') {
      delete merged[locale];
    } else {
      merged[locale] = trimmed;
    }
  }
  return merged;
}

/**
 * What the API is sent for a term's page. Languages the site no longer has
 * keep what they had: the form only speaks for the ones it shows.
 */
export function termFormToChanges(
  term: TermRecord,
  values: TermFormValues,
): UpdateTermInput {
  return {
    name: overlay(term.name, values.names),
    description: overlay(term.description, values.descriptions),
    // An emptied slug is not an empty address: it is the term not being
    // published in that language at all, which is a legitimate state the
    // API models as an absent key.
    slugs: overlay(term.slugs, values.slugs),
    noindex: values.noindex,
    landingPageGroupId: values.landingPageGroupId,
  };
}
