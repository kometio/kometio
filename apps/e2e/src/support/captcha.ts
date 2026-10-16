import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Locator } from '@playwright/test';
import { environment } from './environment';

const run = promisify(execFile);

const SOLVER = resolve(
  import.meta.dirname,
  '../../../../tools/solve-captcha.mjs',
);

/**
 * A solved answer to the captcha built into Kometio, for a request that has
 * no browser to solve it (docs/adr/0103). A token is spent once: ask for one
 * per request.
 *
 * Run as the command it is, the way docker/kometio/check.sh runs it: one
 * solver for both, which depends on nothing and so belongs to no project.
 */
export async function solvedCaptchaToken(): Promise<string> {
  const { stdout } = await run(process.execPath, [SOLVER, environment.apiUrl]);
  return stdout.trim();
}

/**
 * What the widget on the page says it is doing: `unverified` until the visitor
 * starts, then `verifying`, then `verified` (null when it is not the widget).
 */
export function widgetState(widget: Locator): Promise<unknown> {
  return widget.evaluate((element) =>
    'getState' in element && typeof element.getState === 'function'
      ? element.getState()
      : null,
  );
}
