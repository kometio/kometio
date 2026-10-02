import { redirect } from '@tanstack/react-router';
import { ApiError } from '../lib/http-client';

/**
 * Every guarded loader shares this: no dedicated "am I logged in" endpoint
 * exists, so a 401 from whatever the loader actually needs (the pages list,
 * a single page) is the signal — caught here and turned into a redirect to
 * /login, instead of duplicated inline in each route file.
 */
export async function requireAuth<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw redirect({ to: '/login' });
    }
    throw error;
  }
}
