/** Where a file's bytes live — the one list the domain, the wire and the database's `storage_provider` enum all read. */
export const STORAGE_PROVIDERS = ['local', 's3'] as const;

export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];
