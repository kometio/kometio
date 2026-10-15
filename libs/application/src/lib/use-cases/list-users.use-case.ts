import type { User } from '@kometio/domain-core';
import type {
  PaginatedResult,
  SecondFactorRepositoryPort,
  UserRepositoryPort,
} from '@kometio/ports';

export interface ListUsersDeps {
  userRepository: UserRepositoryPort;
  secondFactorRepository: Pick<
    SecondFactorRepositoryPort,
    'whichHaveSecondFactor'
  >;
}

export interface ListUsersInput {
  tenantId: string;
  page: number;
  pageSize: number;
}

/** A page of people, and which of them have the second step of sign-in on (docs/adr/0137). */
export interface ListedUsers extends PaginatedResult<User> {
  withSecondFactor: ReadonlySet<string>;
}

export async function listUsers(
  deps: ListUsersDeps,
  input: ListUsersInput,
): Promise<ListedUsers> {
  const listed = await deps.userRepository.list(input.tenantId, {
    page: input.page,
    pageSize: input.pageSize,
  });
  // One question for the page, not one per person.
  const withSecondFactor =
    await deps.secondFactorRepository.whichHaveSecondFactor(
      input.tenantId,
      listed.items.map((user) => user.id),
    );
  return { ...listed, withSecondFactor };
}
