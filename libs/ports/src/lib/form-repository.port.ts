import type { Form } from '@kometio/domain-core';
import type { PaginatedResult, Pagination } from './pagination';

/**
 * Every method requires tenantId explicitly: no query can "forget" its
 * per-tenant scoping at the Port's signature level, even though the
 * concrete adapter also relies on RLS as a second barrier.
 */
export interface FormRepositoryPort {
  /** A new one. An id already taken fails instead of overwriting. */
  add(form: Form): Promise<void>;
  /** An existing one, written back — never created again: one deleted meanwhile is its "not found". */
  save(form: Form): Promise<void>;
  findById(tenantId: string, formId: string): Promise<Form | null>;
  listBySite(
    tenantId: string,
    siteId: string,
    pagination: Pagination,
  ): Promise<PaginatedResult<Form>>;
  delete(tenantId: string, formId: string): Promise<void>;
}
