import { describe, expect, it } from 'vitest';
import {
  isPrivateAddress,
  PrivateAddressRefusedError,
  publicOnlyLookup,
} from './private-address';

describe('isPrivateAddress', () => {
  it('knows the addresses inside a network', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.10',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      '::',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('lets public addresses, and what is not an address, through', () => {
    for (const address of [
      '93.184.215.14',
      '8.8.8.8',
      '172.32.0.1',
      '2606:4700::1111',
      'api.openai.com',
    ]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

function lookup(hostname: string, all: boolean) {
  return new Promise<{ error: Error | null; result: unknown }>((resolve) => {
    publicOnlyLookup(hostname, { all }, (error, result) =>
      resolve({ error, result }),
    );
  });
}

describe('publicOnlyLookup', () => {
  it('refuses a name that resolves inside the network, in both shapes Node asks for', async () => {
    for (const all of [false, true]) {
      const { error } = await lookup('localhost', all);
      expect(error).toBeInstanceOf(PrivateAddressRefusedError);
    }
  });

  it('answers for a public address as dns.lookup would', async () => {
    expect(await lookup('93.184.215.14', false)).toEqual({
      error: null,
      result: '93.184.215.14',
    });
    expect(await lookup('93.184.215.14', true)).toEqual({
      error: null,
      result: [{ address: '93.184.215.14', family: 4 }],
    });
  });
});
