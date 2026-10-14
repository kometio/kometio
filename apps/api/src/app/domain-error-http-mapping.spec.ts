import * as domainCore from '@kometio/domain-core';
import { mapDomainErrorToHttpException } from './domain-error-http-mapping';

type ErrorClass = abstract new (...args: never[]) => Error;

const isErrorClass = (value: unknown): value is ErrorClass =>
  typeof value === 'function' && value.prototype instanceof Error;

/**
 * Every error the domain exports, as a class. An instance made without
 * running the constructor is enough: the table is read with `instanceof`.
 */
const exportedErrors: [string, ErrorClass][] = [];
for (const [name, value] of Object.entries<unknown>(domainCore)) {
  if (isErrorClass(value)) exportedErrors.push([name, value]);
}

const isMapped = (ErrorClass: ErrorClass): boolean =>
  mapDomainErrorToHttpException(Object.create(ErrorClass.prototype)) !== null;

/**
 * The domain errors that are NOT in the table, and where each is answered
 * instead. An error that is in neither place is a 500 for the person who
 * hit it, and nothing says so until they do.
 */
const NOT_IN_THE_TABLE: Record<string, string> = {
  InvalidCredentialsError:
    'AuthErrorsFilter: one answer for a wrong password and a switched-off account',
  UserNotActiveError:
    'AuthErrorsFilter: one answer for a wrong password and a switched-off account',
  InvalidOrExpiredTokenError: 'AuthErrorsFilter: one 400 for any bad token',
  InvalidSecondFactorError:
    'AuthErrorsFilter: one 401 for any wrong second step, carrying the next challenge',
  ImportJobAlreadyFinishedError:
    'thrown by the job settling its own state in the background, never inside a request',
};

describe('the domain errors and the HTTP table', () => {
  it('knows the errors it is meant to look at', () => {
    // A rename of the export, or of the check above, must not turn the
    // two tests below into loops over nothing.
    expect(exportedErrors.length).toBeGreaterThan(50);
  });

  it('has every error the domain exports in the table, or says where it is answered', () => {
    const unaccounted = exportedErrors
      .filter(([, ErrorClass]) => !isMapped(ErrorClass))
      .map(([name]) => name)
      .filter((name) => !(name in NOT_IN_THE_TABLE));

    expect(unaccounted).toEqual([]);
  });

  it('keeps no error on the list of the unmapped once it is in the table', () => {
    const stale = exportedErrors
      .filter(([name]) => name in NOT_IN_THE_TABLE)
      .filter(([, ErrorClass]) => isMapped(ErrorClass))
      .map(([name]) => name);

    expect(stale).toEqual([]);
  });

  it('names only errors the domain still exports', () => {
    const exported = new Set(exportedErrors.map(([name]) => name));

    expect(
      Object.keys(NOT_IN_THE_TABLE).filter((name) => !exported.has(name)),
    ).toEqual([]);
  });
});
