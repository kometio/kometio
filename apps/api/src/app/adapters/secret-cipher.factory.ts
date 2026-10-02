import { AesGcmSecretCipher, loadMasterKey } from '@kometio/aes-secret-cipher';
import type { SecretCipherPort } from '@kometio/ports';
import type { ApiEnv } from '../../env-schema';

/**
 * The cipher that seals the AI provider's API key (docs/adr/0092), or
 * `null` when the deployment gives it nowhere to keep its key: page
 * generation is then off, and the editor does not offer it — the same
 * rule as theme uploads and THEME_DATA_DIR.
 *
 * KOMETIO_SECRETS_KEY wins when set; otherwise the key is generated on first
 * start in KOMETIO_SECRETS_DIR, a volume of its own outside the database and
 * its backups.
 */
export async function createSecretCipher(
  env: ApiEnv,
): Promise<SecretCipherPort | null> {
  const fromEnv = env.KOMETIO_SECRETS_KEY;
  const directory = env.KOMETIO_SECRETS_DIR;
  if (!fromEnv && !directory) return null;
  const key = await loadMasterKey({ fromEnv, directory: directory ?? '' });
  return new AesGcmSecretCipher(key);
}
