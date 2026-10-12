import { randomUUID } from 'node:crypto';
import { safeDownloadName, type ClassifiedUpload } from '@kometio/domain-core';
import type {
  ImageOptimizerPort,
  MediaStoragePort,
  StoredObject,
} from '@kometio/ports';

export interface StoreUploadDeps {
  mediaStorage: Pick<MediaStoragePort, 'put'>;
  imageOptimizer: ImageOptimizerPort;
}

/** What was kept: the library's row is made from this. */
export interface StoredUpload {
  storageKey: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
}

/**
 * Keeps an uploaded file the way this application keeps files, whichever
 * store it is kept in.
 *
 * The rules are the application's, and the store has none of them
 * (ADR-0113). The bytes decide what a file is, not the declared type
 * (ADR-0054); a file the bytes do not vouch for is taken, but only as a
 * download, under its own directory and name (ADR-0070); a picture is
 * re-encoded once, whatever it was (ADR-0013); anything else is kept as
 * uploaded, under its own sniffed type.
 *
 * `classified` is what the caller already read from the bytes, because it
 * had its own rule to apply to it first (the size a kind may be, whether
 * it has to be a picture at all).
 */
export async function storeUpload(
  deps: StoreUploadDeps,
  file: { filename: string; data: Uint8Array },
  classified: ClassifiedUpload,
): Promise<StoredUpload> {
  const { object, width, height } = await toStoredForm(
    deps.imageOptimizer,
    file,
    classified,
  );
  // After the picture has been read, not before: one that cannot be read
  // must leave nothing behind.
  await deps.mediaStorage.put(object);
  return {
    storageKey: object.key,
    mimeType: object.contentType,
    size: object.data.byteLength,
    width,
    height,
  };
}

async function toStoredForm(
  imageOptimizer: ImageOptimizerPort,
  file: { filename: string; data: Uint8Array },
  classified: ClassifiedUpload,
): Promise<{ object: StoredObject; width: number; height: number }> {
  if (!classified.inline) {
    // Its own directory, so that it can keep the name it was uploaded
    // with: a download is saved under the last segment of its address,
    // and "listino-2026.pdf" should arrive as that, not as a UUID.
    const name = safeDownloadName(file.filename);
    return {
      object: {
        key: `files/${randomUUID()}/${name}`,
        data: file.data,
        contentType: classified.mimeType,
        downloadName: name,
      },
      width: 0,
      height: 0,
    };
  }
  if (classified.kind !== 'image') {
    return {
      object: {
        key: `${randomUUID()}.${classified.extension}`,
        data: file.data,
        // The SNIFFED type, never the declared one: this is what a browser
        // trusts when it plays the file back.
        contentType: classified.mimeType,
      },
      // A video has pixel dimensions and an audio file does not, but
      // reading a container's dimensions means decoding it — a different
      // kind of dependency than the optimizer's. Left unset rather than
      // guessed: nothing in the renderer needs them for these two.
      width: 0,
      height: 0,
    };
  }
  const image = await imageOptimizer.optimize(file.data);
  return {
    object: {
      key: `${randomUUID()}.${image.extension}`,
      data: image.data,
      contentType: image.mimeType,
    },
    width: image.width,
    height: image.height,
  };
}
