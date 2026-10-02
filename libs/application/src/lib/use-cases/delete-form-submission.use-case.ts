import {
  FormNotFoundError,
  FormSubmissionNotFoundError,
} from '@kometio/domain-core';
import type {
  AttachmentStoragePort,
  FormRepositoryPort,
  FormSubmissionRepositoryPort,
} from '@kometio/ports';
import { fileUrlsOf } from '@kometio/shared-types';

export interface DeleteFormSubmissionDeps {
  formRepository: FormRepositoryPort;
  formSubmissionRepository: Pick<
    FormSubmissionRepositoryPort,
    'deleteOne' | 'listAttachmentUrls'
  >;
  attachmentStorage: Pick<AttachmentStoragePort, 'delete'>;
}

export interface DeleteFormSubmissionInput {
  tenantId: string;
  formId: string;
  submissionId: string;
}

/**
 * Deletes one answer to a form — what somebody asks for when they want
 * their data erased and the form holds a hundred others — and the files
 * it carried with it.
 *
 * The form is loaded first, as everywhere else that reads its submissions,
 * so an id under a form that is not this tenant's fails as "form not
 * found" before anything is deleted; and the delete itself names the form
 * as well as the answer, so an answer's id under the wrong form deletes
 * nothing.
 *
 * A CV in the answer is personal data too, and a request to be forgotten
 * is not answered while it sits on disk until the night's sweep. So each
 * file the answer named is removed now — unless another answer names the
 * same file, which would lose it for them. A file that cannot be removed
 * is left for that sweep (`sweepFormAttachments`), which removes what no
 * answer names: the answer is gone either way, and failing the request for
 * it would only make the person ask again for something already done.
 */
export async function deleteFormSubmission(
  deps: DeleteFormSubmissionDeps,
  input: DeleteFormSubmissionInput,
): Promise<void> {
  const form = await deps.formRepository.findById(input.tenantId, input.formId);
  if (!form) {
    throw new FormNotFoundError(input.formId);
  }
  const deleted = await deps.formSubmissionRepository.deleteOne(
    input.tenantId,
    input.formId,
    input.submissionId,
  );
  if (!deleted) {
    throw new FormSubmissionNotFoundError(input.submissionId);
  }

  const carried = fileUrlsOf(deleted.payload);
  if (carried.length === 0) return;
  const stillNamed = await deps.formSubmissionRepository.listAttachmentUrls(
    input.tenantId,
  );
  for (const url of carried) {
    if (stillNamed.has(url)) continue;
    await deps.attachmentStorage.delete(url).catch(() => undefined);
  }
}
