/**
 * The `id` an endpoint answered with. A supertest body is `any`, so reading
 * `body.id` believes whatever came back; this says what a spec is relying on
 * and fails with the body when it is not there.
 */
export function idOf(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'id' in body &&
    typeof body.id === 'string'
  ) {
    return body.id;
  }
  throw new Error(
    `Expected an answer with a string id, got ${JSON.stringify(body)}`,
  );
}
