/**
 * The language a deployment's site is written in by default — what an
 * email falls back to for somebody who has not chosen a language of their
 * own (docs/adr/0100), and for an address that belongs to no account, like
 * a form's notification recipient.
 *
 * A deployment serves one site (docs/adr/0032), so the tenant is enough to
 * ask. `null` when there is no site to ask yet, or none that can be told
 * apart from another: the caller then has its own last resort, and a mail
 * is not held up by it.
 */
export interface DeploymentLocalePort {
  /** e.g. `it`, `en-GB`: a locale of the site, not necessarily one the editor is translated into. */
  defaultLocale(tenantId: string): Promise<string | null>;
}
