import type { UserRole } from '@kometio/domain-core';
import type { UserRepositoryPort } from '@kometio/ports';

export interface SignedInUser {
  userId: string;
  email: string;
  role: UserRole;
}

/**
 * Who a session belongs to, as the editor asks when it starts: their id,
 * email and role. Never a list of permissions — which screens a role may
 * open is the editor's own business (docs/roles.md). `null` when the
 * session outlived the account it belongs to; deactivating an account
 * already ends its sessions.
 */
export async function getSignedInUser(
  deps: { userRepository: UserRepositoryPort },
  session: { tenantId: string; userId: string },
): Promise<SignedInUser | null> {
  const user = await deps.userRepository.findById(
    session.tenantId,
    session.userId,
  );
  return user ? { userId: user.id, email: user.email, role: user.role } : null;
}
