import { randomBytes } from 'node:crypto';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecretUnreadableError } from '@kometio/domain-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AesGcmSecretCipher,
  loadMasterKey,
  MASTER_KEY_FILE,
  secretKeyOf,
} from './aes-secret-cipher.adapter';

const secret = 'sk-ant-api03-an-invented-key';

describe('AesGcmSecretCipher', () => {
  const key = secretKeyOf(randomBytes(32));

  it('opens what it sealed, and never stores the secret in the clear', () => {
    const cipher = new AesGcmSecretCipher(key);
    const sealed = cipher.seal(secret);

    expect(sealed).not.toContain(secret);
    expect(sealed.split('.')).toHaveLength(5);
    expect(cipher.open(sealed)).toBe(secret);
  });

  it('seals the same secret differently every time', () => {
    const cipher = new AesGcmSecretCipher(key);
    expect(cipher.seal(secret)).not.toBe(cipher.seal(secret));
  });

  it('refuses a value that was tampered with, anywhere in it', () => {
    const cipher = new AesGcmSecretCipher(key);
    const parts = cipher.seal(secret).split('.');
    const flip = (value: string) =>
      (value[0] === 'A' ? 'B' : 'A') + value.slice(1);

    for (const index of [2, 3, 4]) {
      const tampered = [...parts];
      tampered[index] = flip(tampered[index]);
      expect(() => cipher.open(tampered.join('.')), `part ${index}`).toThrow(
        SecretUnreadableError,
      );
    }
    expect(() => cipher.open('not a sealed value')).toThrow(
      SecretUnreadableError,
    );
  });

  it('refuses a value whose tag was cut short, even though its first bytes are right', () => {
    const cipher = new AesGcmSecretCipher(key);
    const parts = cipher.seal(secret).split('.');
    const shortTag = Buffer.from(parts[3], 'base64url')
      .subarray(0, 4)
      .toString('base64url');

    expect(() =>
      cipher.open([...parts.slice(0, 3), shortTag, parts[4]].join('.')),
    ).toThrow(SecretUnreadableError);
  });

  it('cannot open a value sealed with a key it does not hold', () => {
    const sealed = new AesGcmSecretCipher(key).seal(secret);
    const other = new AesGcmSecretCipher(secretKeyOf(randomBytes(32)));

    expect(() => other.open(sealed)).toThrow(SecretUnreadableError);
  });

  it('still opens values sealed with a previous key after a change of key', () => {
    const sealedBefore = new AesGcmSecretCipher(key).seal(secret);
    const next = secretKeyOf(randomBytes(32));
    const rotated = new AesGcmSecretCipher(next, [key]);

    expect(rotated.open(sealedBefore)).toBe(secret);
    expect(rotated.seal(secret).split('.')[1]).toBe(next.id);
  });

  it('refuses a key of the wrong length', () => {
    expect(() => secretKeyOf(randomBytes(16))).toThrow(/32 bytes/);
  });
});

describe('loadMasterKey', () => {
  let directory: string;

  beforeEach(async () => {
    directory = join(
      await mkdtemp(join(tmpdir(), 'kometio-secrets-')),
      'secrets',
    );
  });
  afterEach(async () => {
    await rm(join(directory, '..'), { recursive: true, force: true });
  });

  it('creates a key on first start, readable by this process only, and reuses it', async () => {
    const first = await loadMasterKey({ directory });
    const file = join(directory, MASTER_KEY_FILE);

    expect(first.key).toHaveLength(32);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await loadMasterKey({ directory })).id).toBe(first.id);
  });

  it('gives two processes starting together the same key', async () => {
    const [a, b] = await Promise.all([
      loadMasterKey({ directory }),
      loadMasterKey({ directory }),
    ]);
    expect(a.id).toBe(b.id);
  });

  it('leaves no temporary file behind', async () => {
    await loadMasterKey({ directory });
    expect(await readdir(directory)).toEqual([MASTER_KEY_FILE]);
  });

  it('prefers KOMETIO_SECRETS_KEY, and writes no file then', async () => {
    const fromEnv = randomBytes(32).toString('base64');
    const key = await loadMasterKey({ fromEnv, directory });

    expect(key.key.toString('base64')).toBe(fromEnv);
    await expect(readFile(join(directory, MASTER_KEY_FILE))).rejects.toThrow();
  });

  it('refuses a key that is not 32 bytes, from either place', async () => {
    await expect(
      loadMasterKey({ fromEnv: 'c2hvcnQ=', directory }),
    ).rejects.toThrow(/32 bytes/);

    await loadMasterKey({ directory });
    await writeFile(join(directory, MASTER_KEY_FILE), 'c2hvcnQ=');
    await expect(loadMasterKey({ directory })).rejects.toThrow(/32 bytes/);
  });
});
