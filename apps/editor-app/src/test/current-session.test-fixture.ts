import { hasPermission, type UserRole } from '@kometio/shared-types';
import type { useCurrentSession } from '../app/auth/use-current-session';

/**
 * What `useCurrentSession` answers for somebody with this role, deciding
 * by the same table the real hook does — so a spec that mocks the session
 * cannot grant what the API would refuse:
 *
 * ```ts
 * vi.mock('../app/auth/use-current-session', () => ({ useCurrentSession: vi.fn() }));
 * beforeEach(() => {
 *   vi.mocked(useCurrentSession).mockReturnValue(sessionAs('admin'));
 * });
 * ```
 */
export function sessionAs(
  role: UserRole,
): ReturnType<typeof useCurrentSession> {
  return {
    session: undefined,
    role,
    can: (permission) => hasPermission(role, permission),
  };
}
