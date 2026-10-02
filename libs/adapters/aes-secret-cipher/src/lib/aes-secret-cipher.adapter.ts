import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SecretUnreadableError } from '@kometio/domain-core';
import type { SecretCipherPort } from '@kometio/ports';

export interface SecretKey {
  /** Derived from the key itself, so the same key always has the same id. */
  id: string;
  key: Buffer;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const FORMAT = 'v1';

/**
 * AES-256-GCM, a fresh random IV for every value. A sealed value reads
 * `v1.<key id>.<iv>.<tag>.<ciphertext>` (base64url); the version and key
 * id are bound to it as authenticated data, so changing either makes the
 * value fail to open rather than open under another key.
 */
export class AesGcmSecretCipher implements SecretCipherPort {
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(
    private readonly current: SecretKey,
    /** Keys the cipher no longer seals with but may still open with. */
    previous: readonly SecretKey[] = [],
  ) {
    for (const { key } of [current, ...previous]) assertKeyLength(key);
    this.keys = new Map(
      [current, ...previous].map(({ id, key }) => [id, key] as const),
    );
  }

  seal(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.current.key, iv);
    cipher.setAAD(associatedData(this.current.id));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      FORMAT,
      this.current.id,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  open(sealed: string): string {
    const [format, keyId, iv, tag, ciphertext, ...rest] = sealed.split('.');
    const key = keyId === undefined ? undefined : this.keys.get(keyId);
    if (
      format !== FORMAT ||
      rest.length > 0 ||
      keyId === undefined ||
      key === undefined ||
      iv === undefined ||
      tag === undefined ||
      ciphertext === undefined
    ) {
      throw new SecretUnreadableError();
    }
    try {
      // The tag's length fixed: Node otherwise accepts a truncated tag,
      // which is a weaker check of the same ciphertext.
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'base64url'),
        { authTagLength: AUTH_TAG_BYTES },
      );
      decipher.setAAD(associatedData(keyId));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SecretUnreadableError();
    }
  }
}

/** GCM's full tag, the only length a sealed secret is accepted with. */
const AUTH_TAG_BYTES = 16;

function associatedData(keyId: string): Buffer {
  return Buffer.from(`${FORMAT}.${keyId}`, 'utf8');
}

function assertKeyLength(key: Buffer) {
  if (key.length !== KEY_BYTES) {
    throw new Error(`A secrets key must be ${KEY_BYTES} bytes.`);
  }
}

export function secretKeyOf(key: Buffer): SecretKey {
  assertKeyLength(key);
  return {
    id: createHash('sha256').update(key).digest('hex').slice(0, 12),
    key,
  };
}

/** Where the generated key is kept, inside the secrets directory. */
export const MASTER_KEY_FILE = 'master.key';

/**
 * The key secrets are sealed with. `KOMETIO_SECRETS_KEY` (32 bytes, base64)
 * when a deployment sets one; otherwise a key generated on first start and
 * kept in `directory` — a volume of its own, outside the database and its
 * backups, readable by this process only. Nobody installing Kometio has to
 * make one up.
 *
 * Created with an exclusive write: two processes starting together cannot
 * each write a different key.
 */
export async function loadMasterKey(options: {
  fromEnv?: string;
  directory: string;
}): Promise<SecretKey> {
  if (options.fromEnv) {
    const key = Buffer.from(options.fromEnv, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `KOMETIO_SECRETS_KEY must be ${KEY_BYTES} bytes, base64-encoded (openssl rand -base64 32).`,
      );
    }
    return secretKeyOf(key);
  }

  const path = join(options.directory, MASTER_KEY_FILE);
  const existing = await readKeyFile(path);
  if (existing) return existing;

  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  // Written whole to a file of its own, then linked into place: a write
  // cut short (a full disk) leaves a stray temporary file, never a
  // half-written key that every later start would refuse. `link` fails if
  // the key is already there, so of two processes starting together the
  // second takes the first one's key.
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, randomBytes(KEY_BYTES).toString('base64'), {
      flag: 'wx',
      mode: 0o600,
    });
    await link(temporary, path);
  } catch (error) {
    if (!isCode(error, 'EEXIST')) throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  const created = await readKeyFile(path);
  if (!created) throw new Error(`Could not read the secrets key at ${path}.`);
  return created;
}

async function readKeyFile(path: string): Promise<SecretKey | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isCode(error, 'ENOENT')) return null;
    throw error;
  }
  const key = Buffer.from(text.trim(), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`The secrets key at ${path} is not ${KEY_BYTES} bytes.`);
  }
  return secretKeyOf(key);
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
