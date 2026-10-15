import {
  SecondFactorNotEnabledError,
  UserNotFoundError,
} from '@kometio/domain-core';
import type {
  AuthPort,
  SecondFactorRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';

export interface ResetSecondFactorDeps {
  userRepository: Pick<UserRepositoryPort, 'findById'>;
  authPort: Pick<AuthPort, 'invalidateAllSessionsForUser'>;
  secondFactorRepository: Pick<SecondFactorRepositoryPort, 'removeAll'>;
}

export interface ResetSecondFactorInput {
  tenantId: string;
  /** The person whose second step is taken off. */
  targetUserId: string;
}

/**
 * An administrator taking another person's second step off, for the person
 * who has lost the app and the codes.
 *
 * Who may do it is the route's (`@Roles('admin')`), and that it is recorded
 * is the controller's. Every session of the person ends: a reset is asked
 * for when a device is lost, and a lost device may be signed in.
 */
export async function resetSecondFactor(
  deps: ResetSecondFactorDeps,
  input: ResetSecondFactorInput,
): Promise<{ email: string }> {
  const user = await deps.userRepository.findById(
    input.tenantId,
    input.targetUserId,
  );
  if (!user) throw new UserNotFoundError(input.targetUserId);

  const removed = await deps.secondFactorRepository.removeAll(
    input.tenantId,
    input.targetUserId,
  );
  if (!removed) throw new SecondFactorNotEnabledError();

  await deps.authPort.invalidateAllSessionsForUser(
    input.targetUserId,
    input.tenantId,
  );
  // For the activity log's line, which names who it was done to.
  return { email: user.email };
}
