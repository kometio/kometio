import type {
  PageGenerationFailure,
  ThemeUploadFailure,
} from '@kometio/shared-types';

export class PageGroupNotFoundError extends Error {
  constructor(pageGroupId: string) {
    super(`Page group not found: ${pageGroupId}`);
    this.name = 'PageGroupNotFoundError';
  }
}

/**
 * A page that still has subpages cannot be deleted: they would stay, at
 * addresses under a page that no longer exists, and answer 404 everywhere.
 * The message is a code the editor turns into a sentence.
 */
export class PageGroupHasChildrenError extends Error {
  constructor(
    readonly pageGroupId: string,
    readonly childCount: number,
  ) {
    super('page-has-children');
    this.name = 'PageGroupHasChildrenError';
  }
}

/**
 * A page cannot be deleted because one of the pages under it, which would move
 * to the top level, has an address that is already taken there — in this
 * language, by a page, a category or a term. Says which, so it can be renamed
 * or moved first.
 */
export class ChildPageAddressTakenError extends Error {
  constructor(
    readonly slug: string,
    readonly locale: string,
  ) {
    super(
      `The page "${slug}" (${locale}) under this one cannot move to the top level: that address is already taken there. Rename it or move it elsewhere first.`,
    );
    this.name = 'ChildPageAddressTakenError';
  }
}

export class PageGroupVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Page group version not found: ${versionId}`);
    this.name = 'PageGroupVersionNotFoundError';
  }
}

/** reorderSiblingPageGroups was given a group id list that isn't an exact permutation of the actual current sibling group — missing, extra, or foreign ids. */
/** The list of terms given is not exactly the terms that share this parent: one is missing, one is extra, or one is repeated. */
export class TermReorderMismatchError extends Error {
  constructor() {
    super('The provided term order does not match the actual sibling terms');
    this.name = 'TermReorderMismatchError';
  }
}

export class PageGroupReorderMismatchError extends Error {
  constructor() {
    super(
      'The provided page group order does not match the actual sibling group',
    );
    this.name = 'PageGroupReorderMismatchError';
  }
}

/**
 * A page cannot be moved under itself or under one of its own
 * descendants: the tree would close into a ring, and every walk of it —
 * public resolution, the sitemap, the editor's own list — would either
 * never end or quietly drop the whole branch.
 */
export class PageGroupCannotBeItsOwnAncestorError extends Error {
  constructor(pageGroupId: string) {
    super(`A page cannot be moved inside itself: ${pageGroupId}`);
    this.name = 'PageGroupCannotBeItsOwnAncestorError';
  }
}

/** The version asked for does not exist, or belongs to another language — restoring one language from another's history would be a silent cross-wiring, not a restore. */
export class PageTranslationVersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Page translation version not found: ${versionId}`);
    this.name = 'PageTranslationVersionNotFoundError';
  }
}

export class PageTranslationNotFoundError extends Error {
  constructor(pageTranslationId: string) {
    super(`Page translation not found: ${pageTranslationId}`);
    this.name = 'PageTranslationNotFoundError';
  }
}

/** A page group can only have one translation per locale — see the (tenant, pageGroupId, locale) unique constraint in schema.ts. */
export class PageTranslationLocaleAlreadyExistsError extends Error {
  constructor(locale: string) {
    super(`This page group already has a translation in "${locale}"`);
    this.name = 'PageTranslationLocaleAlreadyExistsError';
  }
}

/** Raised when a use-case tries to write a structural mutation (block insert/remove/reorder) meant for the shared PageGroup.content onto a translation that has isDiverged — those go through saveDivergedContent instead. */
export class PageTranslationDivergedError extends Error {
  constructor(pageTranslationId: string) {
    super(
      `Page translation ${pageTranslationId} is diverged from the shared structure`,
    );
    this.name = 'PageTranslationDivergedError';
  }
}

/** The mirror image of PageTranslationDivergedError — raised when a use-case tries to write to a translation's own `divergedContent` (saveDivergedContent) while it is still linked to the shared structure. */
export class PageTranslationNotDivergedError extends Error {
  constructor(pageTranslationId: string) {
    super(
      `Page translation ${pageTranslationId} has not diverged from the shared structure`,
    );
    this.name = 'PageTranslationNotDivergedError';
  }
}

/** A page's (tenant, site, locale, parentId, slug) must be unique, sibling-scoped (WP-style) — see the composite unique constraint + the page_translations_root_slug_unique partial index (root-level pages only) in schema.ts. */
export class PageSlugAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`A page with slug "${slug}" already exists under this parent`);
    this.name = 'PageSlugAlreadyExistsError';
  }
}

/**
 * Deliberately generic: never reveals whether the email exists or the
 * password was wrong (prevents user enumeration via the login endpoint).
 */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * The password typed to confirm who is asking is not the account's.
 *
 * Its own error, and not InvalidCredentialsError: that one answers a
 * sign-in with 401, which says the session is not valid — and here the
 * session is fine, only the confirmation was wrong. It reveals nothing:
 * the caller is signed in as this very account.
 */
export class IncorrectPasswordError extends Error {
  constructor() {
    super('The current password is not correct');
    this.name = 'IncorrectPasswordError';
  }
}

/** The address asked for is the one the account already has: nothing to change, and nothing to confirm. */
export class EmailUnchangedError extends Error {
  constructor() {
    super('That is already the email of this account');
    this.name = 'EmailUnchangedError';
  }
}

/** Covers both an unknown token and one that has expired — same handling either way. */
export class InvalidOrExpiredTokenError extends Error {
  constructor() {
    super('Invalid or expired token');
    this.name = 'InvalidOrExpiredTokenError';
  }
}

export class SiteNotFoundError extends Error {
  constructor(siteId: string) {
    super(`Site not found: ${siteId}`);
    this.name = 'SiteNotFoundError';
  }
}

export class ReusableSectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Reusable section not found: ${id}`);
    this.name = 'ReusableSectionNotFoundError';
  }
}

export class ReusableSectionVersionNotFoundError extends Error {
  constructor(id: string) {
    super(`Reusable section version not found: ${id}`);
    this.name = 'ReusableSectionVersionNotFoundError';
  }
}

/** The unique constraint on (tenant, site, name) surfacing as a domain error — a name is how a person picks a section out of the insert menu. */
export class ReusableSectionNameAlreadyExistsError extends Error {
  constructor(name: string) {
    super(`A section named "${name}" already exists on this site`);
    this.name = 'ReusableSectionNameAlreadyExistsError';
  }
}

/**
 * A page can start only from a PUBLISHED `template` (docs/adr/0072).
 *
 * Not a shared section: copying one onto a new page would hand out, as a
 * loose copy, the thing whose whole promise is that it is never copied.
 * And not a draft: what a template hands out is what its author signed
 * off on, the same rule the canvas follows when it inserts one.
 */
export class NotAPageTemplateError extends Error {
  constructor(sectionId: string) {
    super(`Section ${sectionId} is not a published template`);
    this.name = 'NotAPageTemplateError';
  }
}

export class SiteLayoutSectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Site layout section not found: ${id}`);
    this.name = 'SiteLayoutSectionNotFoundError';
  }
}

export class SiteLayoutSectionVersionNotFoundError extends Error {
  constructor(id: string) {
    super(`Site layout section version not found: ${id}`);
    this.name = 'SiteLayoutSectionVersionNotFoundError';
  }
}

export class FormNotFoundError extends Error {
  constructor(formId: string) {
    super(`Form not found: ${formId}`);
    this.name = 'FormNotFoundError';
  }
}

/** A submission whose payload doesn't match the form's own field
 * definitions (missing required field, wrong type) — never a 500, the
 * public submission endpoint maps this to a 400. */
export class InvalidFormSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFormSubmissionError';
  }
}

/** A failed/expired/missing Turnstile token — unlike the honeypot check
 * (silently accepted so a bot can't tell it was rejected), this is a real
 * visitor-facing error: the public submission endpoint maps it to a 400 so
 * the visitor sees "please retry" instead of a fake success. */
export class InvalidCaptchaError extends Error {
  constructor() {
    super('Invalid or missing CAPTCHA token');
    this.name = 'InvalidCaptchaError';
  }
}

/**
 * A page written in a language its site does not offer: no locale prefix
 * would reach it, and "EN" next to "en" would be a second page, not a
 * second spelling.
 */
export class LocaleNotEnabledError extends Error {
  constructor(locale: string) {
    super(`Locale not enabled on this site: ${locale}`);
    this.name = 'LocaleNotEnabledError';
  }
}

export class CollectionNotFoundError extends Error {
  constructor(collectionId: string) {
    super(`Collection not found: ${collectionId}`);
    this.name = 'CollectionNotFoundError';
  }
}

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

/** A tenant's (tenantId, email) must be unique — see the unique constraint in schema.ts. */
/**
 * Somebody is switching off, or demoting, their own account.
 *
 * Distinct from LastActiveAdminError, and checked before it: even with
 * ten other admins around, doing this to yourself takes effect
 * instantly, ends your own sessions, and the next thing the screen says
 * is that your session expired. Nobody means to do it, and there is
 * always another admin who can. Changing your own access is somebody
 * else's action to take.
 */
export class CannotChangeYourOwnAccessError extends Error {
  constructor() {
    super(
      'You cannot deactivate your own account or change your own role — another administrator has to do it',
    );
    this.name = 'CannotChangeYourOwnAccessError';
  }
}

/**
 * The change would leave the tenant with no admin who can sign in.
 *
 * Deactivating the last active admin, or demoting them, locks EVERYONE
 * out: an editor cannot promote anybody, and there is no way back in
 * through the product — it takes an UPDATE on the database. The screen
 * offers both actions on every row, including your own, which is how it
 * happened.
 */
export class LastActiveAdminError extends Error {
  constructor() {
    super(
      'This is the last active administrator — the change would leave nobody able to administer this site',
    );
    this.name = 'LastActiveAdminError';
  }
}

/** Another person of this tenant already answers at this author address — now, or as a former address still redirecting. */
export class UserSlugAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`The author address "${slug}" is already taken`);
    this.name = 'UserSlugAlreadyExistsError';
  }
}

/** An author address has to be a slug: lowercase letters, digits and single hyphens. */
export class InvalidUserSlugError extends Error {
  constructor(slug: string) {
    super(`"${slug}" is not a valid author address`);
    this.name = 'InvalidUserSlugError';
  }
}

/** A profile picture has to be a picture: the upload's own bytes say it is not one. */
export class AvatarNotAnImageError extends Error {
  constructor() {
    super('A profile picture has to be an image');
    this.name = 'AvatarNotAnImageError';
  }
}

/**
 * The file starts like a picture and is not one that can be decoded: cut
 * short, damaged, or other bytes behind an image's signature. It is what
 * the person uploaded that is wrong, so it is told to them — not a fault of
 * ours, which is what an unhandled decoder error looked like.
 */
export class UnreadableImageError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The file could not be read as an image. Try another file.', options);
    this.name = 'UnreadableImageError';
  }
}

export class UserEmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`A user with email "${email}" already exists`);
    this.name = 'UserEmailAlreadyExistsError';
  }
}

/**
 * Security review 2026-08-24, "third pass": an already-accepted invite
 * cannot be "resent" — the user already has a real password, and sending
 * them the invite link again would let them reset that password without
 * going through the "forgotten password" flow (which verifies identity
 * differently: it invalidates every existing session, and this does not).
 */
export class UserAlreadyActiveError extends Error {
  constructor(userId: string) {
    super(`User already active, cannot resend invite: ${userId}`);
    this.name = 'UserAlreadyActiveError';
  }
}

/**
 * An invitation cannot be cancelled once it has been accepted: the person
 * is a user like any other by then, and removing them is not what this
 * button does.
 */
export class InviteNotPendingError extends Error {
  constructor(userId: string) {
    super(`No pending invitation for this user: ${userId}`);
    this.name = 'InviteNotPendingError';
  }
}

/** Somebody who has not accepted their invitation cannot be switched on by an admin. */
export class InvitePendingError extends Error {
  constructor(userId: string) {
    super(`This user has not accepted their invitation yet: ${userId}`);
    this.name = 'InvitePendingError';
  }
}

/** A file's name is what it is shown and downloaded under: something, and not a path. */
export class InvalidMediaFilenameError extends Error {
  constructor(reason: string) {
    super(`Invalid media filename: ${reason}`);
    this.name = 'InvalidMediaFilenameError';
  }
}

export class FormSubmissionNotFoundError extends Error {
  constructor(submissionId: string) {
    super(`Form submission not found: ${submissionId}`);
    this.name = 'FormSubmissionNotFoundError';
  }
}

export class MediaNotFoundError extends Error {
  constructor(mediaId: string) {
    super(`Media not found: ${mediaId}`);
    this.name = 'MediaNotFoundError';
  }
}

/**
 * An upload the media library will not store.
 *
 * Two callers, guarding two different things. The storage adapters raise
 * it for anything that is not an image, because they put every image
 * through sharp (resize + WebP conversion, ADR-0013) and cannot process
 * what sharp cannot read. `sniffMediaType` raises it for a file whose own
 * BYTES are not an allowed format (ADR-0054) — which matters for video
 * and audio specifically, since those are stored as uploaded rather than
 * re-encoded, so the bytes are the only thing that was ever checked.
 *
 * The argument is optional because the sniffer has nothing useful to put
 * there: what it rejected is the content, not a declared type, and
 * echoing a caller-supplied string into an upload endpoint's error gains
 * nothing.
 */
export class UnsupportedMediaTypeError extends Error {
  constructor(mimeType?: string) {
    super(
      mimeType
        ? `Unsupported media type: ${mimeType}`
        : 'Unsupported media type',
    );
    this.name = 'UnsupportedMediaTypeError';
  }
}

/**
 * Raised by uploadMedia when a file is larger than its kind allows
 * (ADR-0054) — the limits differ because one number cannot serve both a
 * photo and a video.
 *
 * The limit is in the message on purpose: unlike a rejected type, this is
 * something the person uploading can act on, and "too large" without a
 * number is a dead end.
 */
export class MediaTooLargeError extends Error {
  constructor(kind: string, limitBytes: number) {
    super(
      `This ${kind} is larger than the ${Math.round(limitBytes / (1024 * 1024))}MB limit`,
    );
    this.name = 'MediaTooLargeError';
  }
}

/** Raised by sniffAttachmentType when the real content of a public form
 * attachment doesn't match anything on the allowlist — see
 * attachment-type-sniffer.ts for why this exists (security review
 * 2026-08-25: unauthenticated upload, client-declared extension/MIME
 * can't be trusted). */
export class UnsupportedAttachmentTypeError extends Error {
  constructor(declaredMimeType: string) {
    super(`Unsupported attachment type: ${declaredMimeType}`);
    this.name = 'UnsupportedAttachmentTypeError';
  }
}

/** Raised by loginUser when the account exists and the password is
 * correct but the account has been deactivated. Deliberately a distinct
 * error from InvalidCredentialsError (which is generic on purpose to
 * avoid user enumeration) — callers that want to preserve that generic
 * response can still catch both the same way, but the distinct type lets
 * anything that legitimately needs to tell them apart (e.g. logging) do
 * so. */
export class UserNotActiveError extends Error {
  constructor(userId: string) {
    super(`User is not active: ${userId}`);
    this.name = 'UserNotActiveError';
  }
}

/** Raised by updateSiteThemePackage when `themeName` isn't one of this
 * deployment's bundled themes (ThemeCatalogPort, docs/adr/0042) — a stale
 * dropdown option, or a direct API call for a theme this image never shipped. */
/**
 * An uploaded theme the site cannot take (docs/adr/0091). The message IS
 * the reason's code — the editor says it in its own language — and
 * `failure` is the same code, typed.
 */
export class ThemeUploadRejectedError extends Error {
  constructor(readonly failure: ThemeUploadFailure) {
    super(failure);
    this.name = 'ThemeUploadRejectedError';
  }
}

export class ThemeUploadNotFoundError extends Error {
  constructor(id: string) {
    super(`Theme upload not found: ${id}`);
    this.name = 'ThemeUploadNotFoundError';
  }
}

export class InvalidThemeNameError extends Error {
  constructor(themeName: string) {
    super(`Theme not available in this deployment: ${themeName}`);
    this.name = 'InvalidThemeNameError';
  }
}

/**
 * Raised by bootstrapDeployment when this deployment already has a tenant.
 * The first-run wizard is unauthenticated by necessity — there is nobody to
 * authenticate as before it runs — so emptiness is the only thing gating
 * it, and running it twice would mean a stranger granting themselves an
 * admin account on a live install.
 */
export class DeploymentAlreadySetUpError extends Error {
  constructor() {
    super('This Kometio deployment has already been set up');
    this.name = 'DeploymentAlreadySetUpError';
  }
}

export class TaxonomyNotFoundError extends Error {
  constructor(taxonomyId: string) {
    super(`Taxonomy not found: ${taxonomyId}`);
    this.name = 'TaxonomyNotFoundError';
  }
}

export class TermNotFoundError extends Error {
  constructor(termId: string) {
    super(`Term not found: ${termId}`);
    this.name = 'TermNotFoundError';
  }
}

/** Two dimensions cannot share a URL prefix — their terms would answer at the same addresses (docs/adr/0064). */
export class TaxonomyPrefixAlreadyExistsError extends Error {
  constructor(prefix: string) {
    super(`Another taxonomy already uses the prefix "${prefix}"`);
    this.name = 'TaxonomyPrefixAlreadyExistsError';
  }
}

/** The word authors' pages start with (`autore`, `author`) is not a dimension's to take — docs/adr/0071. */
export class TaxonomyPrefixReservedError extends Error {
  constructor(prefix: string) {
    super(
      `The prefix "${prefix}" is where authors' pages live: choose another one`,
    );
    this.name = 'TaxonomyPrefixReservedError';
  }
}

/**
 * Something already answers at the address this term is asking for —
 * another term, or the term's own dimension mounted at the root next to
 * one that is already there. The database refuses it too; this is the
 * name the refusal travels under.
 */
export class TermAddressTakenError extends Error {
  constructor(address: string) {
    super(`Another term already answers at "${address}"`);
    this.name = 'TermAddressTakenError';
  }
}

/**
 * A term's address would collide with a page's. Not expressible as a
 * database constraint — terms and pages live in different tables and
 * only meet in the URL — so it is checked where the write happens
 * (docs/adr/0064).
 */
export class TermAddressCollidesWithPageError extends Error {
  constructor(address: string) {
    super(`A page already answers at "${address}"`);
    this.name = 'TermAddressCollidesWithPageError';
  }
}

/** A term cannot be moved under one of its own descendants, which would detach that branch from its dimension entirely. */
export class TermCycleError extends Error {
  constructor() {
    super('A term cannot become its own descendant');
    this.name = 'TermCycleError';
  }
}

/** A flat dimension ("Tag") has no parents to move a term under — `hierarchical: false` is a promise the editor relies on. */
export class TaxonomyNotHierarchicalError extends Error {
  constructor(taxonomyId: string) {
    super(`Taxonomy ${taxonomyId} does not allow nested terms`);
    this.name = 'TaxonomyNotHierarchicalError';
  }
}

/**
 * The mirror of `TermAddressCollidesWithPageError`: a root page cannot
 * be created on an address a dimension or one of its root-mounted terms
 * already answers (docs/adr/0064).
 */
export class PageSlugCollidesWithTermError extends Error {
  constructor(slug: string) {
    super(`A taxonomy or term already answers at "${slug}"`);
    this.name = 'PageSlugCollidesWithTermError';
  }
}

/**
 * Generating a page from a prompt produced no page. The message is the
 * code, as with ThemeUploadRejectedError, so the editor can say why in the
 * person's language.
 */
export class PageGenerationFailedError extends Error {
  constructor(readonly failure: PageGenerationFailure) {
    super(failure);
    this.name = 'PageGenerationFailedError';
  }
}

/**
 * This deployment has no secrets key, so it cannot keep an API key, and
 * page generation is off: no settings to save, nothing to generate. One
 * error for every route that needs it, where there were a 404 in one
 * controller and a `not-configured` stream in the other.
 */
export class PageGenerationDisabledError extends Error {
  constructor() {
    super('Page generation is off in this deployment.');
    this.name = 'PageGenerationDisabledError';
  }
}

/**
 * A stored secret could not be opened: the key it was sealed with is gone
 * (the secrets volume was lost or replaced) or the value was tampered
 * with. Never the secret itself in the message.
 */
export class SecretUnreadableError extends Error {
  constructor() {
    super('A stored secret could not be opened with the keys available.');
    this.name = 'SecretUnreadableError';
  }
}

/**
 * Page generation settings that cannot be saved as given. The message is
 * the reason: Claude with no API key, stored or new; or a different
 * provider or address with no key of its own — a key is only ever sent
 * where it was typed in for.
 */
export class SiteAiSettingsRejectedError extends Error {
  constructor(readonly reason: 'api-key-required' | 'api-key-for-new-server') {
    super(reason);
    this.name = 'SiteAiSettingsRejectedError';
  }
}
