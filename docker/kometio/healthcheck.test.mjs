import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { notAnswering, targetsFor } from './healthcheck.mjs';

describe('what the healthcheck looks at', () => {
  it('is the API, the site and the editor, each on its own port, in a trial', () => {
    assert.deepEqual(
      targetsFor({}).map(({ name, url }) => [name, url]),
      [
        ['the API', 'http://127.0.0.1:3000/api/health'],
        ['the site', 'http://127.0.0.1:4322/api/health'],
        ['the editor', 'http://127.0.0.1:80/'],
      ],
    );
  });

  it('is the editor on 8080 and Caddy on 80 on a server with a name', () => {
    const targets = targetsFor({ DOMAIN: 'example.com' });

    assert.deepEqual(
      targets.map(({ name, url }) => [name, url]),
      [
        ['the API', 'http://127.0.0.1:3000/api/health'],
        ['the site', 'http://127.0.0.1:4322/api/health'],
        ['the editor', 'http://127.0.0.1:8080/'],
        ['Caddy', 'http://127.0.0.1:80/'],
      ],
    );
  });

  it('is refused for a DOMAIN that the launcher would refuse', () => {
    assert.throws(
      () => targetsFor({ DOMAIN: 'https://example.com' }),
      /like example\.com/,
    );
  });
});

describe('what it takes for a part to be well', () => {
  const answering = (status) =>
    new Promise((resolve) => {
      const server = createServer((_, response) => {
        response.statusCode = status;
        response.end();
      }).listen(0, '127.0.0.1', () => resolve(server));
    });

  for (const [status, well] of [
    [200, true],
    [308, true],
    [404, true],
    [503, false],
  ]) {
    it(`is ${well ? 'well' : 'not well'} when it answers ${status}`, async () => {
      const server = await answering(status);
      const url = `http://127.0.0.1:${server.address().port}/`;

      const failed = await notAnswering({}, [{ name: 'a part', url }]);
      server.close();

      assert.deepEqual(failed, well ? [] : ['a part']);
    });
  }

  it('is not well when nothing is listening, and names it', async () => {
    const server = await answering(200);
    const { port } = server.address();
    server.close();

    const failed = await notAnswering({}, [
      { name: 'the site', url: `http://127.0.0.1:${port}/` },
    ]);

    assert.deepEqual(failed, ['the site']);
  });
});
