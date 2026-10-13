import type { RedirectRecord } from '../../lib/redirects-api-client';

/** What the destination is, as a person chooses it. */
export type DestinationChoice = 'page' | 'url' | 'gone';

export interface ChosenPage {
  pageGroupId: string;
  title: string;
}

/** What the add / edit dialog holds while it is open. */
export interface RedirectFormValues {
  from: string;
  destination: DestinationChoice;
  /** A page of the site, in `locale`; `null` until one is chosen. */
  page: ChosenPage | null;
  locale: string;
  url: string;
  /** For a page or an address; a redirect that says "gone" has no kind to choose. */
  kind: 301 | 302;
}

/** The body the API takes, from what is in the form. `null` while something is missing that the form says in words. */
export type RedirectFormBody =
  | { from: string; to: null; status: 410 }
  | {
      from: string;
      to: { kind: 'page'; pageGroupId: string; locale: string };
      status: 301 | 302;
    }
  | { from: string; to: { kind: 'url'; url: string }; status: 301 | 302 };

export function emptyRedirectForm(
  defaultLocale: string,
  from = '',
): RedirectFormValues {
  return {
    from,
    destination: 'page',
    page: null,
    locale: defaultLocale,
    url: '',
    kind: 301,
  };
}

/** A rule as the dialog edits it. A page that was deleted leaves the choice open, with the language it had. */
export function formFromRecord(record: RedirectRecord): RedirectFormValues {
  const { target } = record;
  const kind: 301 | 302 = record.status === 302 ? 302 : 301;
  const base = { from: record.from, kind };
  if (record.status === 410 || target === null) {
    return {
      ...base,
      destination: 'gone',
      page: null,
      locale: '',
      url: '',
    };
  }
  if (target.kind === 'url') {
    return {
      ...base,
      destination: 'url',
      page: null,
      locale: '',
      url: target.url,
    };
  }
  return {
    ...base,
    destination: 'page',
    page:
      target.pageGroupId === null
        ? null
        : { pageGroupId: target.pageGroupId, title: target.title ?? '' },
    locale: target.locale,
    url: '',
  };
}

/**
 * What goes to the API for this form, or `null` when what the destination
 * needs has not been given (a page not chosen, an address not typed). The
 * dialog then says so under the choice and does not send: the server would
 * say it too, but one request later.
 */
export function bodyFromForm(
  values: RedirectFormValues,
  defaultLocale: string,
): RedirectFormBody | null {
  const from = values.from.trim();
  switch (values.destination) {
    case 'gone':
      return { from, to: null, status: 410 };
    case 'page':
      return values.page === null
        ? null
        : {
            from,
            to: {
              kind: 'page',
              pageGroupId: values.page.pageGroupId,
              locale: values.locale || defaultLocale,
            },
            status: values.kind,
          };
    case 'url': {
      const url = values.url.trim();
      return url === ''
        ? null
        : { from, to: { kind: 'url', url }, status: values.kind };
    }
  }
}
