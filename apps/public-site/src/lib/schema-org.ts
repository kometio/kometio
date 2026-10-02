import type {
  BusinessAddress,
  DayOfWeek,
  OpeningHoursDay,
  SeoMeta,
} from '@kometio/shared-types';
import type { PublishedSite } from '@kometio/api-contracts';

const SCHEMA_ORG_DAY: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

/**
 * An address as schema.org wants it — absolute — or `undefined` when there
 * is none worth giving.
 *
 * Structured data sits inside a block's render, so this must never throw:
 * `new URL('https://')`, which is what somebody leaves behind while typing
 * a link, raised straight out of ProductCard and the page stopped after
 * the first block with "Internal server error". A search engine is also
 * only ever given a web address, never `javascript:` or `mailto:`.
 */
export function absoluteSchemaUrl(
  value: string | null | undefined,
  origin: string,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  // A path is resolved against the site. Anything else has to be a whole
  // address on its own: resolved against the site too, a bare "https:"
  // would quietly become the home page.
  const base = trimmed.startsWith('/') ? origin : undefined;
  if (!URL.canParse(trimmed, base)) {
    return undefined;
  }
  const url = new URL(trimmed, base);
  return url.protocol === 'https:' || url.protocol === 'http:'
    ? url.href
    : undefined;
}

export interface BuildSchemaOrgGraphInput {
  site: PublishedSite;
  seoMeta: SeoMeta;
  pageUrl: string;
}

function hasBusinessInfo(site: PublishedSite): boolean {
  return (
    site.businessAddress !== null ||
    site.businessPhone !== null ||
    site.businessEmail !== null ||
    site.businessType !== null ||
    site.openingHours !== null
  );
}

/**
 * `addressCountry` is the ISO code as stored, not the name: schema.org
 * specifies the code, and it is the one field here a machine reads rather
 * than a person.
 */
function buildPostalAddress(
  address: BusinessAddress | null,
): Record<string, string> | null {
  if (!address) return null;
  const node: Record<string, string> = { '@type': 'PostalAddress' };
  if (address.street.trim()) node['streetAddress'] = address.street.trim();
  if (address.postalCode.trim()) node['postalCode'] = address.postalCode.trim();
  if (address.city.trim()) node['addressLocality'] = address.city.trim();
  if (address.country.trim()) {
    node['addressCountry'] = address.country.trim().toUpperCase();
  }
  // Nothing but the @type means nothing was filled in.
  return Object.keys(node).length > 1 ? node : null;
}

function buildLocalBusinessNode(site: PublishedSite): object {
  const business: Record<string, unknown> = {
    // Falls back to the generic schema.org type when the site hasn't set
    // a more specific one (e.g. "Restaurant") — see docs/adr/0014,
    // businessType is a free-text field, not a validated enum, so any
    // non-empty value the site owner entered is trusted as-is.
    '@type': site.businessType || 'LocalBusiness',
    '@id': '#business',
    name: site.name,
  };
  // A real PostalAddress since docs/adr/0081, not the free-text line
  // ADR-0014 started with: schema.org accepts a string, and Google's Rich
  // Results guidelines ask for the parts, because nothing can tell the
  // town from the street in "Via Roma 1, 00100 Roma".
  //
  // Only the parts that were filled in. A node with empty strings in it
  // is worse than a shorter one — it asserts that the town is "".
  const postalAddress = buildPostalAddress(site.businessAddress);
  if (postalAddress) business['address'] = postalAddress;
  if (site.businessPhone) business['telephone'] = site.businessPhone;
  if (site.businessEmail) business['email'] = site.businessEmail;
  if (site.openingHours) {
    business['openingHoursSpecification'] = site.openingHours.flatMap(
      (day: OpeningHoursDay) =>
        day.ranges.map((range) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: `https://schema.org/${SCHEMA_ORG_DAY[day.dayOfWeek]}`,
          opens: range.opens,
          closes: range.closes,
        })),
    );
  }
  return business;
}

/**
 * WebSite + WebPage always; LocalBusiness only once the site actually has
 * business info set (docs/adr/0014) — a site with none of those fields
 * filled in gets a plain WebSite/WebPage graph, not a broken/empty
 * LocalBusiness node.
 */
export function buildSchemaOrgGraph(input: BuildSchemaOrgGraphInput): object {
  const { site, seoMeta, pageUrl } = input;

  const website = {
    '@type': 'WebSite',
    '@id': '#website',
    name: site.name,
    url: site.domain ? `https://${site.domain}` : pageUrl,
  };
  const webPage = {
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: seoMeta.title,
    description: seoMeta.description,
    isPartOf: { '@id': '#website' },
  };

  const graph: object[] = [website, webPage];
  if (hasBusinessInfo(site)) {
    graph.push(buildLocalBusinessNode(site));
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}
