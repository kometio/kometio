import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  cancelInvite,
  inviteUser,
  listUsers,
  resendInvite,
  setUserActive,
  updateUserRole,
} from '@kometio/application';
import type { User } from '@kometio/domain-core';
import {
  type InvitationRecord,
  type InvitationResendRecord,
  type PaginatedUsers,
  type UserRecord,
  invitationRecordSchema,
  invitationResendRecordSchema,
  paginatedUsersSchema,
  userRecordSchema,
} from '@kometio/api-contracts';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { InvitationsPerHour } from '../auth/per-user-limit.guard';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  type InviteUserBody,
  inviteUserBodySchema,
  type ListUsersQuery,
  listUsersQuerySchema,
  type SetUserActiveBody,
  setUserActiveBodySchema,
  type UpdateUserRoleBody,
  updateUserRoleBodySchema,
} from '@kometio/api-contracts';
import { UuidParam } from '../uuid-param.decorator';
import { RequiresPermission } from '../auth/allowed.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { UsersDeps } from './users.deps';
import { USERS_DEPS } from './users.tokens';
import { TenantId, UserId } from '../auth/session-identity.decorator';
import type { ApiEnv } from '../../env-schema';
import { API_ENV } from '../api-env.module';
import { AuditRecorder } from '../audit/audit-recorder';
import { UndeliveredEmailLog } from '../emails/undelivered-email-log';

// Every endpoint here is admin-only (Fase 5c: "Admin: tutto, incluse
// gestione utenti") — gated at the controller level, not per-method,
// since there's no lower-privilege action to carve out here the way
// PagesController does for publish vs draft.
@Controller('users')
@UseGuards(SessionAuthGuard, RolesGuard)
@RequiresPermission('configureSite')
export class UsersController {
  constructor(
    @Inject(USERS_DEPS) private readonly deps: UsersDeps,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly undeliveredEmails: UndeliveredEmailLog,
    private readonly audit: AuditRecorder,
  ) {}

  @Get()
  async list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<PaginatedUsers> {
    const result = await listUsers(this.deps, {
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
    });
    return paginatedUsersSchema.parse({
      items: result.items.map((user) => this.toDto(user)),
      total: result.total,
    });
  }

  @Post('invite')
  @UseGuards(InvitationsPerHour)
  // The answer can hold the link that signs in as the invitee (`inviteLink`).
  @Header('Cache-Control', 'no-store')
  async invite(
    @TenantId() tenantId: string,
    @UserId() actorUserId: string,
    @Body(new ZodValidationPipe(inviteUserBodySchema)) body: InviteUserBody,
  ): Promise<InvitationRecord> {
    const { user, undelivered, inviteLink } = await inviteUser(this.deps, {
      tenantId,
      email: body.email,
      displayName: body.displayName,
      role: body.role,
      language: body.language,
      inviteUrlBase: this.env.EDITOR_APP_URL,
    });
    // The person is made and the link works: a mail server that refused the
    // message is told to the administrator who is looking (`emailSent`), and
    // to the log for the reason.
    this.undeliveredEmails.report('Invitation', undelivered);
    if (inviteLink !== null) {
      this.undeliveredEmails.withheld('Invitation', user.email);
    }
    await this.audit.record({
      tenantId,
      actorUserId,
      action: 'user.invited',
      targetId: user.id,
      targetLabel: user.email,
      detail: { role: user.role },
    });
    return invitationRecordSchema.parse({
      user: this.toDto(user),
      emailSent: undelivered.length === 0,
      inviteLink,
    });
  }

  /**
   * Security review 2026-08-24, "third pass": an expired invite (7 days,
   * see inviteUser) left the invitee's email blocked forever
   * (UserEmailAlreadyExistsError on a new invite), with no way of giving
   * them a fresh link. It rejects with UserAlreadyActiveError (mapped to a
   * 409 below) when the invite has already been accepted — resending it
   * would make no sense.
   */
  @Post(':id/resend-invite')
  @UseGuards(InvitationsPerHour)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async resend(
    @TenantId() tenantId: string,
    @UserId() actorUserId: string,
    @UuidParam('id') id: string,
  ): Promise<InvitationResendRecord> {
    const { user, undelivered, inviteLink } = await resendInvite(this.deps, {
      tenantId,
      userId: id,
      inviteUrlBase: this.env.EDITOR_APP_URL,
    });
    this.undeliveredEmails.report('Invitation (sent again)', undelivered);
    if (inviteLink !== null) {
      this.undeliveredEmails.withheld('Invitation (sent again)', user.email);
    }
    await this.audit.record({
      tenantId,
      actorUserId,
      action: 'user.invite_resent',
      targetId: user.id,
      targetLabel: user.email,
    });
    return invitationResendRecordSchema.parse({
      emailSent: undelivered.length === 0,
      inviteLink,
    });
  }

  /**
   * Withdraws an invitation nobody has accepted: the person is removed
   * (409 once they have accepted — they are a user by then). No body, no
   * answer: what changed is that the row is gone.
   */
  @Delete(':id/invite')
  @HttpCode(204)
  async cancelInvitation(
    @TenantId() tenantId: string,
    @UserId() actorUserId: string,
    @UuidParam('id') id: string,
  ): Promise<void> {
    const { email } = await cancelInvite(this.deps, { tenantId, userId: id });
    await this.audit.record({
      tenantId,
      actorUserId,
      action: 'user.invite_cancelled',
      targetId: id,
      targetLabel: email,
    });
  }

  @Patch(':id/role')
  async updateRole(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(updateUserRoleBodySchema))
    body: UpdateUserRoleBody,
  ) {
    const user = await updateUserRole(this.deps, {
      tenantId,
      userId: id,
      role: body.role,
      actorUserId: userId,
    });
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      action: 'user.role_changed',
      targetId: user.id,
      targetLabel: user.email,
      detail: { role: user.role },
    });
    return this.toDto(user);
  }

  @Patch(':id/active')
  async setActive(
    @TenantId() tenantId: string,
    @UserId() userId: string,
    @UuidParam('id') id: string,
    @Body(new ZodValidationPipe(setUserActiveBodySchema))
    body: SetUserActiveBody,
  ) {
    const user = await setUserActive(this.deps, {
      tenantId,
      userId: id,
      isActive: body.isActive,
      actorUserId: userId,
    });
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      action: user.isActive ? 'user.activated' : 'user.deactivated',
      targetId: user.id,
      targetLabel: user.email,
    });
    return this.toDto(user);
  }

  /** Built field-by-field, never a `...rest` of toProps() — unlike Page (no secret fields), a user row has passwordHash, which must never reach the client. */
  private toDto(user: User): UserRecord {
    const props = user.toProps();
    return userRecordSchema.parse({
      id: props.id,
      tenantId: props.tenantId,
      email: props.email,
      displayName: props.displayName,
      slug: props.slug,
      avatarUrl: props.avatar
        ? this.deps.mediaStorage.getUrl(props.avatar.storageKey)
        : null,
      role: props.role,
      isActive: props.isActive,
      invitePending: props.invitePending,
      language: props.language,
      emailVerifiedAt: props.emailVerifiedAt?.toISOString() ?? null,
      createdAt: props.createdAt.toISOString(),
    });
  }
}
