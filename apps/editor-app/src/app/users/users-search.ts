import { z } from 'zod';

// Same reasoning as pagesListSearchSchema/mediaListSearchSchema: keeps
// `page` optional at the type level for every plain
// <Link to="/settings/users"> and falls back cleanly on a garbled value
// (?page=abc). Its own module, read by the users route and by the old
// /users address that redirects to it, so the two cannot disagree on what
// a page number is.
export const usersListSearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
  // Arrive with "Invite" already open — the search's action. Read once and
  // dropped from the URL, so a reload does not ask again.
  invite: z.boolean().optional().catch(undefined),
});
