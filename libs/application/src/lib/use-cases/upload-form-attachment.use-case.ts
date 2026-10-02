import { sniffAttachmentType } from '@kometio/domain-core';
import type {
  AttachmentStoragePort,
  FormRepositoryPort,
  UploadAttachmentResult,
} from '@kometio/ports';
import { getFormById } from './get-form-by-id.use-case';

export interface UploadFormAttachmentDeps {
  formRepository: FormRepositoryPort;
  attachmentStorage: AttachmentStoragePort;
}

export interface UploadFormAttachmentInput {
  tenantId: string;
  formId: string;
  /** As the visitor's browser named it: kept to show back, never to build a path from. */
  filename: string;
  /** As the visitor's browser declared it: used only to tell apart container formats the bytes cannot. */
  declaredMimeType: string;
  data: Uint8Array;
}

/**
 * Stores a file a visitor attached to a public form, ahead of their
 * submission. The form is looked up first, so a file cannot be filed under
 * a form that does not exist; then what the file IS is read from its
 * bytes. This path is unauthenticated, and the type and name a client
 * declares are entirely its own to choose (security review 2026-08-25):
 * the stored extension comes from the sniffed type, never from the
 * filename.
 */
export async function uploadFormAttachment(
  deps: UploadFormAttachmentDeps,
  input: UploadFormAttachmentInput,
): Promise<UploadAttachmentResult> {
  const form = await getFormById(deps, {
    tenantId: input.tenantId,
    formId: input.formId,
  });
  const sniffed = sniffAttachmentType(input.data, input.declaredMimeType);
  return deps.attachmentStorage.upload({
    formId: form.id,
    filename: input.filename,
    mimeType: sniffed.mimeType,
    extension: sniffed.extension,
    data: input.data,
  });
}
