import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@kometio/domain-core';

export const ROLES_KEY = 'roles';

/** Applied per-endpoint (or at the controller level, e.g. UsersController) — checked by RolesGuard, which must run after SessionAuthGuard in the same @UseGuards() chain. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
