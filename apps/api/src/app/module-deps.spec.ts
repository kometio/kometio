import { Test } from '@nestjs/testing';
import { moduleDeps } from './module-deps';

const FIRST = Symbol('FIRST');
const SECOND = Symbol('SECOND');
const DEPS = Symbol('DEPS');

describe('moduleDeps', () => {
  it('builds one object from the tokens it names, key by key', async () => {
    const first = { name: 'first' };
    const second = { name: 'second' };
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: FIRST, useValue: first },
        { provide: SECOND, useValue: second },
        moduleDeps<{ a: typeof first; b: typeof second }>(DEPS, {
          a: FIRST,
          b: SECOND,
        }),
      ],
    }).compile();

    const deps = moduleRef.get<{ a: unknown; b: unknown }>(DEPS);
    expect(deps.a).toBe(first);
    expect(deps.b).toBe(second);
  });
});
