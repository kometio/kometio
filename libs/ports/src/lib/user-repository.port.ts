import type { User } from '@kometio/domain-core';
import type { PaginatedResult, Pagination } from './pagination';

/**
 * Every method requires tenantId explicitly: no query can "forget" its
 * per-tenant scoping at the Port's signature level, even though the
 * concrete adapter also relies on RLS as a second barrier.
 *
 * There is no write of the whole row, on purpose. One writes every column as
 * it was READ, so whatever an admin changed in between — the role, whether
 * the person can sign in — is put back. Each write below says which columns
 * it owns and touches nothing else.
 */
export interface UserRepositoryPort {
  /** A new one. An id already taken fails instead of overwriting. */
  add(user: User): Promise<void>;
  /**
   * Writes what a person says about themselves — name, address (with the
   * ones they left) and bio — and nothing else of the row.
   *
   * Only these columns: a profile saved a moment after an admin changed the
   * person's role, or switched them off, must not put the old role or status
   * back.
   */
  saveProfile(user: User): Promise<void>;
  /**
   * Writes how the person signs in — password and email, with whether the
   * email is verified — and nothing else of the row.
   *
   * Only these columns, for the reason `saveProfile` gives: a password
   * changed a moment after an admin switched the person off must not switch
   * them back on. An email already taken by somebody else is refused
   * (UserEmailAlreadyExistsError), whoever wins the race.
   */
  saveCredentials(user: User): Promise<void>;
  /**
   * Writes an accepted invitation: the password the person chose, and that
   * they are now active and no longer pending — and nothing else of the row.
   * Only these columns, for the reason `saveProfile` gives: an admin changing the
   * invitee's role in the moment between the link being read and accepted
   * would be undone.
   *
   * Only while the invitation is still pending, in the same statement:
   * answers whether a row changed, so the caller can tell "accepted" from
   * "cancelled meanwhile".
   */
  saveInviteAccepted(user: User): Promise<boolean>;
  /** Writes the language alone, for the same reason as `saveProfile`: choosing one must not bring back a name or a role that changed meanwhile. */
  saveLanguage(user: User): Promise<void>;
  /** Writes the picture alone, for the same reason as `saveProfile` — a name saved while a picture uploads must not bring the old picture back. */
  saveAvatar(user: User): Promise<void>;
  findById(tenantId: string, userId: string): Promise<User | null>;
  findByEmail(tenantId: string, email: string): Promise<User | null>;
  /** The person whose author page is at this address now. */
  findBySlug(tenantId: string, slug: string): Promise<User | null>;
  /** The person whose author page used to be at this address — what a 301 is sent on to. */
  findByFormerSlug(tenantId: string, slug: string): Promise<User | null>;
  /**
   * Whether another person already answers at this address, as their
   * current one or as a former one still redirecting. A former address is
   * taken too: giving it to someone else would silently turn a redirect
   * that works into a page about the wrong person.
   */
  isSlugTaken(
    tenantId: string,
    slug: string,
    exceptUserId: string | null,
  ): Promise<boolean>;
  /** Same Pagination/PaginatedResult shape as PageRepositoryPort.listBySite — the "Utenti" section (Fase 5c) needed a listing the same way Pages did before GET /pages existed. */
  list(
    tenantId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<User>>;
  /**
   * Writes who the user is to the site — their role and whether they can
   * sign in — and nothing else, refusing (LastActiveAdminError) a change
   * that would leave the tenant with no admin able to sign in.
   *
   * The check and the write are one step, not a count and then a save:
   * two admins demoting each other at the same moment each counted two
   * admins, each went ahead, and the tenant was left with none (audit
   * B11). The real adapter locks the admin rows while it decides.
   */
  saveAccess(user: User): Promise<void>;
  /**
   * Deletes an invitee who has not accepted, and only one: the row and the
   * pending flag are checked in the same statement that deletes, so an
   * invitation accepted a moment before the admin pressed Cancel is not
   * taken away from somebody who is already a user. Answers whether a row
   * went, so the caller can tell "cancelled" from "too late".
   */
  removePendingInvite(tenantId: string, userId: string): Promise<boolean>;
}
