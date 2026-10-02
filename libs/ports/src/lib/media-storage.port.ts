import type { StorageProvider } from '@kometio/domain-core';

export interface UploadMediaInput {
  tenantId: string;
  /** `null` for a file that belongs to no site: a person's profile picture follows them across every site of the tenant. */
  siteId: string | null;
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export interface UploadMediaResult {
  storageKey: string;
  // Not necessarily UploadMediaInput.mimeType echoed back — every adapter
  // processes uploads through a conversion step (see ADR-0013, WebP), so
  // this is the actual stored representation's type.
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
}

/** Implementata da LocalDiskAdapter (default) e S3CompatibleAdapter — vedi libs/adapters. */
export interface MediaStoragePort {
  /** Which concrete backend this is — lets a caller (e.g. uploadMedia) fill
   * in Media.storageProvider without needing its own separate config. */
  readonly provider: StorageProvider;
  upload(input: UploadMediaInput): Promise<UploadMediaResult>;
  getUrl(storageKey: string): string;
  delete(storageKey: string): Promise<void>;
}
