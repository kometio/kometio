import { describe, expect, it } from 'vitest';
import {
  phpArray,
  phpString,
  phpUnserialize,
  PhpUnserializeError,
} from './php-unserialize';

describe('phpUnserialize', () => {
  it('reads the scalars', () => {
    expect(phpUnserialize('s:4:"ciao";')).toBe('ciao');
    expect(phpUnserialize('i:42;')).toBe(42);
    expect(phpUnserialize('i:-7;')).toBe(-7);
    expect(phpUnserialize('b:1;')).toBe(true);
    expect(phpUnserialize('b:0;')).toBe(false);
    expect(phpUnserialize('d:1.5;')).toBe(1.5);
    expect(phpUnserialize('N;')).toBeNull();
  });

  it('counts a string in bytes, not in characters', () => {
    // The trap, and on an Italian site it is the first word you hit: the
    // length PHP writes is bytes, so "Caffè" is 6 and a reader counting
    // characters walks off the end of every accented string.
    expect(phpUnserialize('s:6:"Caffè";')).toBe('Caffè');
    expect(
      phpUnserialize('a:2:{s:6:"caffè";s:8:"è buono";i:0;s:2:"ok";}'),
    ).toEqual(
      new Map<string | number, unknown>([
        ['caffè', 'è buono'],
        [0, 'ok'],
      ]),
    );
  });

  it('keeps a quote, a brace and a semicolon inside a string', () => {
    // The length says where the string ends, so none of these terminate
    // it — a reader that scans for the closing quote gets this wrong.
    expect(phpUnserialize('s:9:"a";}i:1;"";')).toBe('a";}i:1;"');
  });

  it('reads an array as a Map, in the order it was written', () => {
    // Why a Map and not an object: a JS object puts integer-like keys
    // first, in ascending order, whatever order they came in. A
    // repeater's rows are a list, and coming out shuffled is the kind of
    // thing nobody notices until a page is wrong.
    const value = phpUnserialize('a:2:{s:1:"a";i:1;i:2;s:1:"b";}');

    expect([...(value as Map<string | number, unknown>).keys()]).toEqual([
      'a',
      2,
    ]);
    expect(Object.keys({ a: 1, 2: 'b' })).toEqual(['2', 'a']);
  });

  it('reads the nesting an ACF field definition is made of', () => {
    const value = phpUnserialize(
      'a:2:{s:4:"type";s:5:"group";s:10:"sub_fields";a:1:{i:0;a:2:{s:4:"name";s:5:"title";s:4:"type";s:4:"text";}}}',
    );

    expect(phpString(value, 'type')).toBe('group');
    const subFields = phpArray(value, 'sub_fields');
    expect(phpString(subFields?.get(0) ?? null, 'name')).toBe('title');
  });

  it('reads an empty array and an empty string', () => {
    expect(phpUnserialize('a:0:{}')).toEqual(new Map());
    expect(phpUnserialize('s:0:"";')).toBe('');
  });

  it('refuses something that is not PHP at all, where it went wrong', () => {
    // A postmeta value is whatever a plugin put there; this has to say so
    // rather than return half a structure.
    expect(() => phpUnserialize('{"json": true}')).toThrow(PhpUnserializeError);
    expect(() => phpUnserialize('s:99:"troppo corta";')).toThrow(
      /past the end/,
    );
    expect(() => phpUnserialize('a:1:{s:1:"a";')).toThrow(PhpUnserializeError);
  });

  it('gives nothing rather than throwing when a reader asks for the wrong shape', () => {
    // The helpers are read by code walking an unknown definition, where
    // "this key is not a string" is an ordinary answer, not a failure.
    expect(phpString('not an array', 'type')).toBe('');
    expect(phpString(phpUnserialize('a:1:{s:1:"a";i:1;}'), 'a')).toBe('');
    expect(phpArray(null, 'sub_fields')).toBeNull();
  });
});
