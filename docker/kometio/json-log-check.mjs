// What is wrong with the log of a container that was started with
// KOMETIO_LOG_FORMAT=json and KOMETIO_ACCESS_LOG=true (check.sh, docs/adr/0122).
//
//   docker logs CONTAINER 2>&1 | node json-log-check.mjs REQUEST_ID QUERY_SECRET
//
// REQUEST_ID is the `X-Request-Id` of a request that was sent to the API, and
// QUERY_SECRET a value that was in its query string. One answer a line, `ok: …`
// or `FAIL: …`; the exit code is 1 if any is a FAIL.
import { readFileSync } from 'node:fs';

const [requestId, querySecret] = process.argv.slice(2);
const lines = readFileSync(0, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '');

const notObjects = [];
const objects = [];
for (const line of lines) {
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    // Counted below, with the line.
  }
  const isObject =
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  if (isObject && typeof parsed.service === 'string') objects.push(parsed);
  else notObjects.push(line);
}

const answers = [];
const expect = (what, holds, detail = '') =>
  answers.push(holds ? `ok: ${what}` : `FAIL: ${what}${detail}`);

expect(
  `every one of the ${lines.length} lines of the log is a JSON object that says which part wrote it`,
  lines.length > 0 && notObjects.length === 0,
  notObjects.length
    ? `; first that is not: ${notObjects[0].slice(0, 160)}`
    : '',
);

const services = new Set(objects.map((line) => line.service));
for (const part of ['kometio', 'api', 'postgres']) {
  expect(
    `the ${part === 'kometio' ? 'launcher' : part} is in it, under its own name`,
    services.has(part),
    `; the parts seen are ${[...services].join(', ') || 'none'}`,
  );
}

const access = objects.find(
  (line) =>
    line.service === 'api' &&
    line.context === 'Access' &&
    line.requestId === requestId,
);
expect(
  'the request is a line of the API’s log with its request id, its path without the query and its status',
  access !== undefined &&
    access.method === 'GET' &&
    access.path === '/api/does-not-exist' &&
    access.status === 404 &&
    typeof access.durationMs === 'number',
  access ? `; it is ${JSON.stringify(access)}` : '; there is no such line',
);

expect(
  'what was in the query of that request is nowhere in the log',
  !lines.some((line) => line.includes(querySecret)),
);

// The one thing a person does first is read the token. The launcher's banner
// puts it on a line of its own, as it does in text.
expect(
  'the setup token is a line of its own in the launcher’s banner',
  objects.some(
    (line) =>
      line.service === 'kometio' &&
      /^\s+[A-Za-z0-9_-]{43}\s*$/.test(String(line.message)),
  ),
);

console.log(answers.join('\n'));
process.exitCode = answers.some((answer) => answer.startsWith('FAIL')) ? 1 : 0;
