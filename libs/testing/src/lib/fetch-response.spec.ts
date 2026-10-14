import { describe, expect, it } from 'vitest';
import { emptyResponse, jsonResponse } from './fetch-response.test-fixture';

describe('jsonResponse', () => {
  it('is ok for a 2xx and says its status', async () => {
    const response = jsonResponse({ hello: 'world' }, 201);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ hello: 'world' });
  });

  it('is not ok for a 4xx or a 5xx, whatever the body says', () => {
    expect(jsonResponse({ ok: true }, 404).ok).toBe(false);
    expect(jsonResponse({}, 500).ok).toBe(false);
  });

  it('can be read twice, as one mocked answer is given to every call', async () => {
    const response = jsonResponse({ n: 1 });

    expect(await response.json()).toEqual({ n: 1 });
    expect(await response.json()).toEqual({ n: 1 });
    expect(await response.text()).toBe('{"n":1}');
  });

  it('says it is JSON', () => {
    expect(jsonResponse({}).headers.get('content-type')).toBe(
      'application/json',
    );
  });
});

describe('emptyResponse', () => {
  it('is a 204 with no body, and ok', async () => {
    const response = emptyResponse();

    expect(response.status).toBe(204);
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe('');
  });
});
