import {
  describeRedirectSource,
  parseRedirectSource,
} from '@kometio/shared-types';
import type { RedirectProblem } from './redirect-problems';

/** What the old address a person is typing will be kept as — said while they type it. */
export type AddressReading =
  | { state: 'empty' }
  | { state: 'problem'; problem: RedirectProblem }
  | {
      state: 'exact' | 'pattern';
      /** How the rule will hold it: lower case, no trailing slash, no host. */
      shown: string;
      /** The `:name`s (and `*`) a destination may use. */
      placeholders: string[];
    };

/**
 * The same reading the API makes (`shared-types`, one function for both), so
 * that the sentence under the field is what saving will do — a pasted
 * `https://Old-Site.com/2019/05/Hello/` is shown as `/2019/05/hello` before
 * anybody presses Save, and a mistake is said where it is made.
 */
export function readTypedAddress(input: string): AddressReading {
  if (input.trim() === '') return { state: 'empty' };
  const parsed = parseRedirectSource(input);
  if (!parsed.ok) {
    return {
      state: 'problem',
      problem: {
        side: 'source',
        problem: parsed.problem,
        ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
      },
    };
  }
  return {
    state: parsed.kind,
    shown: describeRedirectSource(parsed.source),
    placeholders: parsed.placeholders,
  };
}
