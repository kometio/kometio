import { z } from 'zod';

// Same reasoning as usersListSearchSchema: `page` optional at the type level
// for every plain <Link to="/settings/activity">, and a garbled value
// (?page=abc) falls back to the first page.
export const activitySearchSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).catch(1),
});
