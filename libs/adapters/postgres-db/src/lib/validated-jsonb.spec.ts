import { pgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { seoMetaSchema } from '@kometio/shared-types';
import {
  StoredJsonInvalidError,
  validatedJsonb,
  type JsonSchema,
} from './validated-jsonb';

/** A schema made by hand: what the column needs of one is `safeParse`, and nothing of zod's. */
const wantsAName: JsonSchema<{ name: string }> = {
  safeParse(value) {
    const name =
      typeof value === 'object' && value !== null
        ? Reflect.get(value, 'name')
        : undefined;
    return typeof name === 'string'
      ? { success: true, data: { name } }
      : {
          success: false,
          error: {
            issues: [{ path: ['name'], message: 'Expected a string' }],
          },
        };
  },
};

const people = pgTable('people', { card: validatedJsonb('card', wantsAName) });

describe('validatedJsonb', () => {
  describe('on a read', () => {
    it('gives back the value that is stored, itself, with the keys the schema did not know', () => {
      const stored = { name: 'Ada', somethingAnOlderVersionWrote: 1 };

      const read = people.card.mapFromDriverValue(stored);

      expect(read).toBe(stored);
    });

    it('reads a value the driver gave as text', () => {
      expect(people.card.mapFromDriverValue('{"name":"Ada"}')).toEqual({
        name: 'Ada',
      });
    });

    it('refuses a value that is not what the schema says, naming the column, where in it and why', () => {
      expect.assertions(4);
      try {
        people.card.mapFromDriverValue({ name: 42 });
      } catch (error) {
        if (!(error instanceof StoredJsonInvalidError)) throw error;
        expect(error.column).toBe('card');
        expect(error.direction).toBe('read');
        expect(error.message).toContain('stored in "card"');
        expect(error.message).toContain('name: Expected a string');
      }
    });

    it('does not put the value in the message: the content of a page is not for a log', () => {
      expect.assertions(1);
      try {
        people.card.mapFromDriverValue({
          name: 42,
          secret: 'ada@example.test',
        });
      } catch (error) {
        expect(String(error)).not.toContain('ada@example.test');
      }
    });
  });

  describe('on a write', () => {
    it('writes the value as it is, with the keys the schema did not know', () => {
      const withExtraKeys = { name: 'Ada', extra: true };

      const written = people.card.mapToDriverValue(withExtraKeys);

      expect(JSON.parse(String(written))).toEqual({ name: 'Ada', extra: true });
    });

    it('refuses a value that is not what the schema says', () => {
      expect(() => people.card.mapToDriverValue({ name: 42 })).toThrow(
        /being written to "card"/,
      );
    });
  });

  it('says how many more there were when there are many issues, and no more than five', () => {
    const manyWrong: JsonSchema<unknown> = {
      safeParse: () => ({
        success: false,
        error: {
          issues: Array.from({ length: 12 }, (_, index) => ({
            path: [index],
            message: 'Expected a string',
          })),
        },
      }),
    };
    const table = pgTable('t', { v: validatedJsonb('v', manyWrong) });

    expect(() => table.v.mapFromDriverValue([])).toThrow(
      /0: Expected a string; 1: .*; 4: Expected a string; and 7 more$/,
    );
  });

  it('holds a real schema of the application to its word: a page translation’s `{}` is not a SeoMeta', () => {
    const table = pgTable('translations', {
      seoMeta: validatedJsonb('seo_meta', seoMetaSchema),
    });

    expect(() => table.seoMeta.mapFromDriverValue({})).toThrow(
      StoredJsonInvalidError,
    );
    expect(
      table.seoMeta.mapFromDriverValue({ title: 'Home', description: '' }),
    ).toEqual({ title: 'Home', description: '' });
  });
});
