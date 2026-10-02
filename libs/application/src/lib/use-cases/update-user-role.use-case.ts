import { assertNotYourself } from './assert-not-yourself';
import { UserNotFoundError } from '@kometio/domain-core';
import type { User, UserRole } from '@kometio/domain-core';
import type { UserRepositoryPort } from '@kometio/ports';

export interface UpdateUserRoleDeps {
  userRepository: UserRepositoryPort;
}

export interface UpdateUserRoleInput {
  tenantId: string;
  userId: string;
  role: UserRole;
  /** Who is asking — nobody may change their own role, see CannotChangeYourOwnAccessError. */
  actorUserId: string | null;
}

export async function updateUserRole(
  deps: UpdateUserRoleDeps,
  input: UpdateUserRoleInput,
): Promise<User> {
  const user = await deps.userRepository.findById(input.tenantId, input.userId);
  if (!user) {
    throw new UserNotFoundError(input.userId);
  }

  if (input.role !== user.role) {
    assertNotYourself(input.actorUserId, user);
  }
  user.changeRole(input.role);
  // Refuses to leave the site with no admin, in the same step as the write.
  await deps.userRepository.saveAccess(user);

  return user;
}
