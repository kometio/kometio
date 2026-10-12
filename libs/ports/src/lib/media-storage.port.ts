import type { StorageProvider } from '@kometio/domain-core';

/**
 * One file, as the application has decided it is to be kept.
 *
 * Everything about what the file IS has been decided before it gets here:
 * what its bytes are, whether a browser may open it, whether a picture
 * is re-encoded, what it is called (`storeUpload`, in `@kometio/application`).
 * The store writes what it is given.
 */
export interface StoredObject {
  /**
   * Where it is kept, and what `getUrl` answers for: relative, no leading
   * slash, made by the application from a UUID and an extension it chose.
   * A store still refuses one that would leave its own root.
   */
  key: string;
  data: Uint8Array;
  /** What it is served as: the application's reading of the bytes, never what the client declared. */
  contentType: string;
  /**
   * Present for a file that has to be saved and never opened: the name it
   * is saved as. A bucket serves the object itself, with no application in
   * the path to add a header later, so the rule is stored with it.
   */
  downloadName?: string | undefined;
}

/** Implementata da LocalDiskAdapter (default) e S3CompatibleAdapter — vedi libs/adapters. */
export interface MediaStoragePort {
  /** Which concrete backend this is — lets a caller (e.g. uploadMedia) fill
   * in Media.storageProvider without needing its own separate config. */
  readonly provider: StorageProvider;
  /** Writes the object under its key. It decides nothing about it. */
  put(object: StoredObject): Promise<void>;
  getUrl(storageKey: string): string;
  delete(storageKey: string): Promise<void>;
}
