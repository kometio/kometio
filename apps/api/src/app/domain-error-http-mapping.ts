import {
  BadRequestException,
  PayloadTooLargeException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  type HttpException,
  type Type,
} from '@nestjs/common';
import {
  DeploymentAlreadySetUpError,
  InvalidCaptchaError,
  InvalidFormSubmissionError,
  InvalidThemeNameError,
  ThemeUploadNotFoundError,
  SiteAiSettingsRejectedError,
  PageGenerationDisabledError,
  SiteArchiveRefusedError,
  SiteArchiveUnavailableError,
  PageGenerationFailedError,
  SecretUnreadableError,
  ThemeUploadRejectedError,
  ImportJobNotFoundError,
  MediaNotFoundError,
  NotAPageTemplateError,
  PageGroupHasChildrenError,
  ChildPageAddressTakenError,
  PageGroupNotFoundError,
  PageGroupCannotBeItsOwnAncestorError,
  PageGroupReorderMismatchError,
  TermReorderMismatchError,
  PageGroupVersionNotFoundError,
  PageSlugAlreadyExistsError,
  PageSlugCollidesWithTermError,
  PageTranslationDivergedError,
  PageTranslationLocaleAlreadyExistsError,
  LocaleNotEnabledError,
  PageTranslationNotDivergedError,
  PageTranslationNotFoundError,
  PageTranslationVersionNotFoundError,
  ReusableSectionNameAlreadyExistsError,
  ReusableSectionNotFoundError,
  ReusableSectionVersionNotFoundError,
  SiteLayoutSectionNotFoundError,
  SiteLayoutSectionVersionNotFoundError,
  SiteNotFoundError,
  TaxonomyNotFoundError,
  TaxonomyNotHierarchicalError,
  TaxonomyPrefixAlreadyExistsError,
  TaxonomyPrefixReservedError,
  TermAddressCollidesWithPageError,
  TermAddressTakenError,
  TermCycleError,
  TermNotFoundError,
  UnsupportedAttachmentTypeError,
  MediaTooLargeError,
  InvalidMediaFilenameError,
  UnsupportedMediaTypeError,
  UserAlreadyActiveError,
  InviteNotPendingError,
  InvitePendingError,
  UserEmailAlreadyExistsError,
  EmailUnchangedError,
  UserSlugAlreadyExistsError,
  InvalidUserSlugError,
  AvatarNotAnImageError,
  UnreadableImageError,
  CannotChangeYourOwnAccessError,
  IncorrectPasswordError,
  CollectionNotFoundError,
  LastActiveAdminError,
  UserNotFoundError,
  FormNotFoundError,
  FormSubmissionNotFoundError,
} from '@kometio/domain-core';
import { DeploymentNotSetUpError } from './deployment-tenant.resolver';

type DomainErrorFactory = (message: string) => HttpException;

/**
 * One table in place of the 7 duplicated private `handleDomainErrors` (one
 * per controller: pages/forms/public-forms/site-layout-sections/sites/
 * users/media, each with the same try/catch and its own whitelist) —
 * security review 2026-08-24, point 17. Consumed by HttpExceptionFilter,
 * never by the controllers themselves: a domain error now propagates
 * without being intercepted there, and the global filter maps it once.
 *
 * Three errors are NOT here — InvalidCredentialsError, UserNotActiveError
 * and InvalidOrExpiredTokenError carry anti-enumeration rules (the same
 * generic answer for wrong credentials AND a deactivated account, see
 * loginUser) that a generic map would break. AuthErrorsFilter answers them
 * for the auth routes, in one place.
 */
const DOMAIN_ERROR_MAPPINGS: Array<[Type<Error>, DomainErrorFactory]> = [
  // 503, not 500: a visitor reaching a deployment whose first-run wizard
  // has not been completed is a temporary, expected state with a real
  // remedy, not a fault. It is also the only entry here that is not a
  // domain error — it lives in this table anyway because the alternative
  // is a second try/catch in every public controller, which is exactly the
  // duplication this table replaced.
  [DeploymentNotSetUpError, (m) => new ServiceUnavailableException(m)],
  // 409: the wizard has already been run. Not 403 — nothing about the
  // caller is wrong, the deployment's state is simply past the point where
  // this request means anything.
  [DeploymentAlreadySetUpError, (m) => new ConflictException(m)],
  [PageGroupNotFoundError, (m) => new NotFoundException(m)],
  [PageGroupHasChildrenError, (m) => new ConflictException(m)],
  // 409: nothing about the caller is wrong; a subpage's address is taken
  // where it would land, and the answer names which.
  [ChildPageAddressTakenError, (m) => new ConflictException(m)],
  [PageGroupVersionNotFoundError, (m) => new NotFoundException(m)],
  [PageTranslationNotFoundError, (m) => new NotFoundException(m)],
  [PageTranslationVersionNotFoundError, (m) => new NotFoundException(m)],
  [FormNotFoundError, (m) => new NotFoundException(m)],
  [FormSubmissionNotFoundError, (m) => new NotFoundException(m)],
  [ReusableSectionNotFoundError, (m) => new NotFoundException(m)],
  [ReusableSectionVersionNotFoundError, (m) => new NotFoundException(m)],
  [SiteLayoutSectionNotFoundError, (m) => new NotFoundException(m)],
  [SiteLayoutSectionVersionNotFoundError, (m) => new NotFoundException(m)],
  [SiteNotFoundError, (m) => new NotFoundException(m)],
  [UserNotFoundError, (m) => new NotFoundException(m)],
  [CollectionNotFoundError, (m) => new NotFoundException(m)],
  [MediaNotFoundError, (m) => new NotFoundException(m)],
  [ImportJobNotFoundError, (m) => new NotFoundException(m)],
  [PageSlugAlreadyExistsError, (m) => new ConflictException(m)],
  [ReusableSectionNameAlreadyExistsError, (m) => new ConflictException(m)],
  [PageTranslationLocaleAlreadyExistsError, (m) => new ConflictException(m)],
  [LocaleNotEnabledError, (m) => new BadRequestException(m)],
  [PageTranslationDivergedError, (m) => new ConflictException(m)],
  [PageTranslationNotDivergedError, (m) => new ConflictException(m)],
  [UserEmailAlreadyExistsError, (m) => new ConflictException(m)],
  [EmailUnchangedError, (m) => new BadRequestException(m)],
  [UserAlreadyActiveError, (m) => new ConflictException(m)],
  // 409: the invitation is not in the state the request needs — already
  // accepted for a cancel, not accepted yet for a switch-on.
  [InviteNotPendingError, (m) => new ConflictException(m)],
  [InvitePendingError, (m) => new ConflictException(m)],
  // 409, like the two above it: nothing about the caller is wrong, the
  // tenant is simply in a state where this request would destroy access
  // to itself.
  [LastActiveAdminError, (m) => new ConflictException(m)],
  // 403, not 409: here the caller IS the problem — the request is
  // refused because of who is making it, not because of the tenant's
  // state.
  [CannotChangeYourOwnAccessError, (m) => new ForbiddenException(m)],
  // 403, not 401: the session is valid and stays valid — only the password
  // typed to confirm it was wrong. A 401 tells a client to sign in again,
  // which is the one thing it must not do here.
  [IncorrectPasswordError, (m) => new ForbiddenException(m)],
  [PageGroupReorderMismatchError, (m) => new BadRequestException(m)],
  [TermReorderMismatchError, (m) => new BadRequestException(m)],
  // A ring in the tree is a request that cannot be satisfied, not a
  // conflict with someone else's write.
  [PageGroupCannotBeItsOwnAncestorError, (m) => new BadRequestException(m)],
  [InvalidFormSubmissionError, (m) => new BadRequestException(m)],
  [InvalidCaptchaError, (m) => new BadRequestException(m)],
  [UserSlugAlreadyExistsError, (m) => new ConflictException(m)],
  [InvalidUserSlugError, (m) => new BadRequestException(m)],
  // 415 would be the literal status, but the editor shows every refused
  // upload the same way, and the library's own refusals are 400s too.
  [AvatarNotAnImageError, (m) => new BadRequestException(m)],
  // 400, like the two refusals around it: the upload is what is wrong.
  [UnreadableImageError, (m) => new BadRequestException(m)],
  [UnsupportedAttachmentTypeError, (m) => new BadRequestException(m)],
  [UnsupportedMediaTypeError, (m) => new BadRequestException(m)],
  // 413, not 400: the request was well formed, it was too big — and the
  // status is what a client can act on without parsing the message.
  [MediaTooLargeError, (m) => new PayloadTooLargeException(m)],
  [InvalidMediaFilenameError, (m) => new BadRequestException(m)],
  [InvalidThemeNameError, (m) => new BadRequestException(m)],
  // The message is the reason's code (ThemeUploadRejectedError), which the
  // editor turns into a sentence in its own language.
  [ThemeUploadRejectedError, (m) => new BadRequestException(m)],
  [ThemeUploadNotFoundError, (m) => new NotFoundException(m)],
  // The reason's code, as with a theme upload: the editor says it in words.
  [SiteAiSettingsRejectedError, (m) => new BadRequestException(m)],
  // 404: this deployment has no page generation to reach, the same
  // answer as a route that is not there.
  [PageGenerationDisabledError, (m) => new NotFoundException(m)],
  // A generation refused before its stream opens — no provider, a key
  // that no longer opens, the site already busy — is the site's state,
  // not the request's shape. The message is the failure's code, which
  // the editor says in words exactly as it does one from the stream.
  [PageGenerationFailedError, (m) => new ConflictException(m)],
  [SecretUnreadableError, (m) => new ConflictException(m)],
  // 404: this deployment has no archive to give, the same answer as a route that is not there.
  [SiteArchiveUnavailableError, (m) => new NotFoundException(m)],
  // 409: the server is able, and not now — one is being made, or there is no site yet.
  [SiteArchiveRefusedError, (m) => new ConflictException(m)],
  [TaxonomyNotFoundError, (m) => new NotFoundException(m)],
  [TermNotFoundError, (m) => new NotFoundException(m)],
  // 409 for all four address conflicts: the request is well formed and
  // the caller can act on it — pick another name — which is exactly what
  // a conflict means. The message names what is in the way, term or
  // page, because "that address is taken" without saying by what sends
  // somebody hunting through the wrong list (docs/adr/0064).
  [TaxonomyPrefixAlreadyExistsError, (m) => new ConflictException(m)],
  [TaxonomyPrefixReservedError, (m) => new ConflictException(m)],
  [TermAddressTakenError, (m) => new ConflictException(m)],
  [TermAddressCollidesWithPageError, (m) => new ConflictException(m)],
  [PageSlugCollidesWithTermError, (m) => new ConflictException(m)],
  // 400, not 409: nothing is occupied, the shape of the request is
  // simply impossible — a term cannot descend from itself, and a flat
  // dimension has no parents to offer.
  [TermCycleError, (m) => new BadRequestException(m)],
  // 404, the same answer as a template that does not exist: to the person
  // starting a page, a shared section or a draft is no template to start
  // from either (docs/adr/0072). It also keeps 400 meaning "the request
  // itself is malformed", which is what lets the editor tell "that
  // template has gone" apart from a name too long for an address.
  [NotAPageTemplateError, (m) => new NotFoundException(m)],
  [TaxonomyNotHierarchicalError, (m) => new BadRequestException(m)],
];

/** `null` when `error` is not one of the domain errors known here — the caller (HttpExceptionFilter) then treats it as a raw 500. */
export function mapDomainErrorToHttpException(
  error: unknown,
): HttpException | null {
  if (!(error instanceof Error)) {
    return null;
  }
  for (const [ErrorClass, factory] of DOMAIN_ERROR_MAPPINGS) {
    if (error instanceof ErrorClass) {
      return factory(error.message);
    }
  }
  return null;
}
