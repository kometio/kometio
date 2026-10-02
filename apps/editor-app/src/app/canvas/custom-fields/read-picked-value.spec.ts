import { describe, expect, it } from 'vitest';
import { pickedMediaSchema } from '@kometio/shared-types';
import { readPickedValue } from './read-picked-value';

describe('readPickedValue', () => {
  it('returns a value the schema accepts', () => {
    expect(
      readPickedValue(pickedMediaSchema, { mediaId: 'm1', url: '/m1.jpg' }),
    ).toEqual({ mediaId: 'm1', url: '/m1.jpg' });
  });

  it('reads no key at all, and anything else, as nothing chosen', () => {
    expect(readPickedValue(pickedMediaSchema, undefined)).toBeNull();
    expect(readPickedValue(pickedMediaSchema, null)).toBeNull();
    expect(readPickedValue(pickedMediaSchema, 'm1')).toBeNull();
    expect(readPickedValue(pickedMediaSchema, { url: '/m1.jpg' })).toBeNull();
  });
});
