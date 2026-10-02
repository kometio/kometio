import { applyDecorators, UseGuards } from '@nestjs/common';
import { PERMISSIONS, type Permission } from '@kometio/shared-types';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/**
 * Who may call a route, by what it does — the same table the editor shows
 * its buttons by (`PERMISSIONS`, docs/roles.md). Routes that only write
 * drafts carry none: every role may, and the session is the check.
 */

/** The roles a permission allows, as RolesGuard reads them. On a controller, with `@UseGuards(SessionAuthGuard, RolesGuard)`. */
export const RequiresPermission = (permission: Permission) =>
  Roles(...PERMISSIONS[permission]);

/**
 * On a route, below the controller's SessionAuthGuard — a controller's
 * guards run before its routes', so the session is known by then. Not on
 * a controller: there Nest applies decorators bottom-up and RolesGuard
 * could run before the session is read.
 */
export const Allowed = (permission: Permission) =>
  applyDecorators(UseGuards(RolesGuard), RequiresPermission(permission));
