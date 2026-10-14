import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Refusal } from './archive.mjs';
import { assertClusterIsOpenable } from './embedded-postgres.mjs';

describe('assertClusterIsOpenable', () => {
  it('lets a volume made by the Postgres this image carries be opened', () => {
    assert.doesNotThrow(() => assertClusterIsOpenable(18, 18));
  });

  // The way across a major version is the site's export, which is SQL: said in
  // the refusal, with both versions, because "files are incompatible with
  // server" is all that Postgres itself would have said, after the fact.
  it('refuses a volume of an older major, and says how the site gets across', () => {
    assert.throws(
      () => assertClusterIsOpenable(16, 18),
      (error) =>
        error instanceof Refusal &&
        /made by PostgreSQL 16/.test(error.message) &&
        /carries 18/.test(error.message) &&
        /cli\.mjs export/.test(error.message) &&
        /new volume/.test(error.message) &&
        /has not been changed/.test(error.message),
    );
  });

  it('refuses a volume of a newer major, and says to start the version that made it', () => {
    assert.throws(
      () => assertClusterIsOpenable(19, 18),
      (error) =>
        error instanceof Refusal &&
        /made by PostgreSQL 19/.test(error.message) &&
        /newer than the 18/.test(error.message) &&
        /Start the Kometio that made it/.test(error.message),
    );
  });
});
