import type { User } from '@kometio/domain-core';
import type { PaginatedResult, UserRepositoryPort } from '@kometio/ports';

export interface ListUsersDeps {
  userRepository: UserRepositoryPort;
}

export interface ListUsersInput {
  tenantId: string;
  page: number;
  pageSize: number;
}

export function listUsers(
  deps: ListUsersDeps,
  input: ListUsersInput,
): Promise<PaginatedResult<User>> {
  return deps.userRepository.list(input.tenantId, {
    page: input.page,
    pageSize: input.pageSize,
  });
}
