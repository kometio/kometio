import { and, eq, ne, or, sql } from 'drizzle-orm';
import {
  LastActiveAdminError,
  User,
  UserEmailAlreadyExistsError,
  UserNotFoundError,
  UserSlugAlreadyExistsError,
  type UserProps,
} from '@kometio/domain-core';
import { isInterfaceLanguage } from '@kometio/shared-types';
import type {
  PaginatedResult,
  Pagination,
  UserRepositoryPort,
} from '@kometio/ports';
import {
  DrizzlePaginatedRepository,
  type KometioDb,
  type KometioTx,
  isUniqueViolation,
  users,
  withTenant,
} from '@kometio/postgres-db';

// The second is the one a case-only difference trips: `Ana@x.it` against
// `ana@x.it`. Either is the same refusal.
const EMAIL_UNIQUE_CONSTRAINTS = [
  'users_tenant_id_email_unique',
  'users_tenant_id_email_lower_unique',
];
const SLUG_UNIQUE_CONSTRAINT = 'users_tenant_id_slug_unique';

function toRow(props: UserProps) {
  return {
    id: props.id,
    tenantId: props.tenantId,
    email: props.email,
    displayName: props.displayName,
    passwordHash: props.passwordHash,
    role: props.role,
    isActive: props.isActive,
    invitePending: props.invitePending,
    emailVerifiedAt: props.emailVerifiedAt,
    createdAt: props.createdAt,
    slug: props.slug,
    formerSlugs: props.formerSlugs,
    bio: props.bio,
    avatarStorageKey: props.avatar?.storageKey ?? null,
    avatarWidth: props.avatar?.width ?? null,
    avatarHeight: props.avatar?.height ?? null,
    language: props.language,
  };
}

function fromRow(row: typeof users.$inferSelect): User {
  const { avatarStorageKey, avatarWidth, avatarHeight, language, ...rest } =
    row;
  return User.fromProps({
    ...rest,
    // A language Kometio no longer speaks reads as none chosen: the site's
    // default stands in, rather than a string no template has.
    language:
      language !== null && isInterfaceLanguage(language) ? language : null,
    avatar: avatarStorageKey
      ? {
          storageKey: avatarStorageKey,
          width: avatarWidth,
          height: avatarHeight,
        }
      : null,
  });
}

/** Connects as `kometio_app` — see docs/adr/0002-non-superuser-role-for-rls-enforcement.md. */
export class DrizzleUserRepository
  extends DrizzlePaginatedRepository<typeof users.$inferSelect, User>
  implements UserRepositoryPort
{
  protected readonly table = users;
  protected readonly idColumn = users.id;
  protected readonly tenantIdColumn = users.tenantId;

  constructor(db: KometioDb) {
    super(db);
  }

  protected toRow(user: User) {
    return toRow(user.toProps());
  }

  protected fromRow(row: typeof users.$inferSelect): User {
    return fromRow(row);
  }

  protected notFound(id: string): Error {
    return new UserNotFoundError(id);
  }

  override add(user: User): Promise<void> {
    return this.withUniqueViolations(user, () => super.add(user));
  }

  /**
   * A conflict on UNIQUE(tenant_id, email), or on the author slug, surfaces
   * as a raw `PostgresError` under real concurrency (two near-simultaneous
   * invites or registrations for the same email both passing the use
   * case's check-then-act). Translated into the same domain error the use
   * case already throws in the common case.
   */
  private async withUniqueViolations(
    user: User,
    write: () => Promise<void>,
  ): Promise<void> {
    const row = this.toRow(user);
    try {
      await write();
    } catch (error) {
      if (
        EMAIL_UNIQUE_CONSTRAINTS.some((name) => isUniqueViolation(error, name))
      ) {
        throw new UserEmailAlreadyExistsError(row.email);
      }
      // The use case checks first; this is the race two people saving the
      // same address at the same moment would otherwise win silently.
      if (row.slug && isUniqueViolation(error, SLUG_UNIQUE_CONSTRAINT)) {
        throw new UserSlugAlreadyExistsError(row.slug);
      }
      throw error;
    }
  }

  async saveProfile(user: User): Promise<void> {
    const props = user.toProps();
    try {
      await withTenant(this.db, props.tenantId, (tx: KometioTx) =>
        tx
          .update(users)
          .set({
            displayName: props.displayName,
            slug: props.slug,
            formerSlugs: props.formerSlugs,
            bio: props.bio,
          })
          .where(
            and(eq(users.tenantId, props.tenantId), eq(users.id, props.id)),
          ),
      );
    } catch (error) {
      if (props.slug && isUniqueViolation(error, SLUG_UNIQUE_CONSTRAINT)) {
        throw new UserSlugAlreadyExistsError(props.slug);
      }
      throw error;
    }
  }

  async saveCredentials(user: User): Promise<void> {
    const { tenantId, id, email, emailVerifiedAt, passwordHash } =
      user.toProps();
    try {
      await withTenant(this.db, tenantId, (tx: KometioTx) =>
        tx
          .update(users)
          .set({ email, emailVerifiedAt, passwordHash })
          .where(and(eq(users.tenantId, tenantId), eq(users.id, id))),
      );
    } catch (error) {
      if (
        EMAIL_UNIQUE_CONSTRAINTS.some((name) => isUniqueViolation(error, name))
      ) {
        throw new UserEmailAlreadyExistsError(email);
      }
      throw error;
    }
  }

  async saveInviteAccepted(user: User): Promise<boolean> {
    const { tenantId, id, passwordHash } = user.toProps();
    const accepted = await withTenant(this.db, tenantId, (tx: KometioTx) =>
      tx
        .update(users)
        .set({ passwordHash, isActive: true, invitePending: false })
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.id, id),
            eq(users.invitePending, true),
          ),
        )
        .returning({ id: users.id }),
    );
    return accepted.length > 0;
  }

  async saveLanguage(user: User): Promise<void> {
    const { tenantId, id, language } = user.toProps();
    await withTenant(this.db, tenantId, (tx: KometioTx) =>
      tx
        .update(users)
        .set({ language })
        .where(and(eq(users.tenantId, tenantId), eq(users.id, id))),
    );
  }

  async saveAvatar(user: User): Promise<void> {
    const { tenantId, id, avatar } = user.toProps();
    await withTenant(this.db, tenantId, (tx: KometioTx) =>
      tx
        .update(users)
        .set({
          avatarStorageKey: avatar?.storageKey ?? null,
          avatarWidth: avatar?.width ?? null,
          avatarHeight: avatar?.height ?? null,
        })
        .where(and(eq(users.tenantId, tenantId), eq(users.id, id))),
    );
  }

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(users)
        // Compared without case, like the unique index it shares an
        // expression with: an address typed `Mario@X.it` is the account
        // invited as `mario@x.it`.
        .where(
          and(
            eq(users.tenantId, tenantId),
            sql`lower(${users.email}) = lower(${email})`,
          ),
        )
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findBySlug(tenantId: string, slug: string): Promise<User | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.slug, slug)))
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async findByFormerSlug(tenantId: string, slug: string): Promise<User | null> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            sql`${users.formerSlugs} @> ARRAY[${slug}]::text[]`,
          ),
        )
        .limit(1),
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async isSlugTaken(
    tenantId: string,
    slug: string,
    exceptUserId: string | null,
  ): Promise<boolean> {
    const rows = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            ...(exceptUserId ? [ne(users.id, exceptUserId)] : []),
            or(
              eq(users.slug, slug),
              sql`${users.formerSlugs} @> ARRAY[${slug}]::text[]`,
            ),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  }

  async removePendingInvite(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const removed = await withTenant(this.db, tenantId, (tx: KometioTx) =>
      tx
        .delete(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.id, userId),
            eq(users.invitePending, true),
          ),
        )
        .returning({ id: users.id }),
    );
    return removed.length > 0;
  }

  /** Most recently created first — matches PageRepositoryPort.listBySite's own convention. */
  async list(
    tenantId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<User>> {
    return this.listPaginatedTx(
      tenantId,
      eq(users.tenantId, tenantId),
      users.createdAt,
      pagination,
    );
  }

  /**
   * The admin rows are locked (`FOR UPDATE`) before they are counted, so a
   * second change of access in this tenant waits for this one to commit
   * and then counts what it left: two admins demoting each other can no
   * longer both see two admins and both go ahead.
   */
  async saveAccess(user: User): Promise<void> {
    const { tenantId, id, role, isActive } = user.toProps();
    await withTenant(this.db, tenantId, async (tx: KometioTx) => {
      const activeAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(users.role, 'admin'),
            eq(users.isActive, true),
          ),
        )
        .for('update');
      const others = activeAdmins.filter((admin) => admin.id !== id).length;
      if (others === 0 && !(role === 'admin' && isActive)) {
        throw new LastActiveAdminError();
      }
      const updated = await tx
        .update(users)
        .set({ role, isActive })
        .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
        .returning({ id: users.id });
      if (updated.length === 0) {
        throw new UserNotFoundError(id);
      }
    });
  }
}
