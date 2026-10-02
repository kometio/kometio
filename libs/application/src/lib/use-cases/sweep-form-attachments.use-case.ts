import {
  storedAttachmentPathOf,
  type AttachmentStoragePort,
  type FormSubmissionRepositoryPort,
} from '@kometio/ports';

export interface SweepFormAttachmentsDeps {
  attachmentStorage: Pick<AttachmentStoragePort, 'listStored' | 'delete'>;
  formSubmissionRepository: Pick<
    FormSubmissionRepositoryPort,
    'listAttachmentUrls'
  >;
}

export interface SweepFormAttachmentsInput {
  tenantId: string;
  /**
   * Only files stored before this are considered: an upload is written a
   * moment before the submission that names it, and one caught in that
   * moment must not be taken for an orphan.
   */
  storedBefore: Date;
}

/**
 * Removes every stored form attachment no submission names any more.
 *
 * One sweep for the two ways a file ends up named by no submission,
 * which used to leave it on disk for good (audit B4):
 * - it was uploaded and the form never sent — by a bot that only uploads,
 *   or a visitor who gave up;
 * - its submission reached the site's retention limit and was deleted,
 *   while the CV in it stayed, past the date the site promised.
 *
 * Deleting a form keeps its submissions, so it keeps their files too.
 *
 * Single tenant per deployment, like the retention job it follows.
 */
export async function sweepFormAttachments(
  deps: SweepFormAttachmentsDeps,
  input: SweepFormAttachmentsInput,
): Promise<{ deleted: number }> {
  // Compared by stored path, not by url: a site that moved to another
  // address still names its files by the old one, and compared by url
  // every one of them would have looked abandoned.
  const named = new Set(
    [
      ...(await deps.formSubmissionRepository.listAttachmentUrls(
        input.tenantId,
      )),
    ].map(storedAttachmentPathOf),
  );
  let deleted = 0;
  for await (const stored of deps.attachmentStorage.listStored()) {
    const path = storedAttachmentPathOf(stored.url);
    if (
      path === null ||
      stored.storedAt >= input.storedBefore ||
      named.has(path)
    ) {
      continue;
    }
    await deps.attachmentStorage.delete(stored.url);
    deleted += 1;
  }
  return { deleted };
}
