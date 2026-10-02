# @kometio/aes-secret-cipher

The `SecretCipherPort` adapter: seals a secret a site owner typed into the
editor (an AI provider's API key) before it is stored, and opens it when it
is needed. AES-256-GCM with a random IV per value; a sealed value reads
`v1.<key id>.<iv>.<tag>.<ciphertext>`, and the version and key id are
authenticated with it.

## The key

`loadMasterKey` returns `KOMETIO_SECRETS_KEY` (32 bytes, base64) when the
deployment sets one. Otherwise it generates a key on first start in a
directory of its own — a volume outside the database and its backups, mode
0700, the file 0600 — and reuses it from then on. Nobody installing Kometio has
to make one up.

A database dump alone opens nothing. Losing the key loses the stored API
keys, and only those: the site owner types them in again.

A cipher can hold previous keys it still opens with, so the key can be
replaced without making old values unreadable.
