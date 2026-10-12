/**
 * The language a page's row shows, and so the one its state is judged by:
 * the site's default language when the page has it, otherwise the first by
 * code (`de` before `en`), whatever order the translations arrive in.
 *
 * A page has a state per language and a list row shows one: its title, its
 * address, its date and its state all come from the same translation, so a
 * state taken from another one would be the single part of the row talking
 * about something else. The pages list filters by state in SQL
 * (`statusCondition`, in the page repository) and has to judge by this same
 * translation; `page-list-state-cases` in `@kometio/testing` holds the two
 * to the same answers.
 */
export function shownTranslation<T extends { locale: string }>(
  translations: readonly T[],
  defaultLocale: string,
): T | undefined {
  let first: T | undefined;
  for (const translation of translations) {
    if (translation.locale === defaultLocale) return translation;
    if (first === undefined || translation.locale < first.locale) {
      first = translation;
    }
  }
  return first;
}
