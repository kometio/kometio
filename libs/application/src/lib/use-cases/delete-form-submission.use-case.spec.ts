import { describe, expect, it } from 'vitest';
import {
  Form,
  FormNotFoundError,
  FormSubmission,
  FormSubmissionNotFoundError,
} from '@kometio/domain-core';
import type { AttachmentStoragePort } from '@kometio/ports';
import {
  InMemoryFormRepository,
  InMemoryFormSubmissionRepository,
} from '@kometio/testing';
import { deleteFormSubmission } from './delete-form-submission.use-case';

const tenantId = 'tenant-1';
const siteId = 'site-1';
const formId = 'form-1';

/** Records what it was asked to remove; `failing` urls refuse, like a store that is down. */
function recordingStorage(failing: string[] = []) {
  const removed: string[] = [];
  const storage: Pick<AttachmentStoragePort, 'delete'> = {
    async delete(url) {
      if (failing.includes(url)) throw new Error('store is down');
      removed.push(url);
    },
  };
  return { storage, removed };
}

async function setup(failing: string[] = []) {
  const formRepository = new InMemoryFormRepository();
  const formSubmissionRepository = new InMemoryFormSubmissionRepository();
  await formRepository.add(
    Form.create({ id: formId, tenantId, siteId, name: 'Contatti' }),
  );
  const { storage, removed } = recordingStorage(failing);
  return {
    deps: {
      formRepository,
      formSubmissionRepository,
      attachmentStorage: storage,
    },
    formSubmissionRepository,
    removed,
  };
}

async function answer(
  repository: InMemoryFormSubmissionRepository,
  id: string,
  payload: Record<string, unknown>,
) {
  await repository.save(
    FormSubmission.create({
      id,
      tenantId,
      siteId,
      pageId: null,
      formId,
      payload,
    }),
  );
}

const cv = (name: string) => ({
  url: `/uploads/forms/${name}.pdf`,
  filename: `${name}.pdf`,
});

describe('deleteFormSubmission', () => {
  it('deletes the answer and the files it named, now and not at the night’s sweep', async () => {
    const { deps, formSubmissionRepository, removed } = await setup();
    await answer(formSubmissionRepository, 's1', {
      email: 'a@example.com',
      cv: cv('one'),
      portfolio: cv('two'),
    });
    await answer(formSubmissionRepository, 's2', { email: 'b@example.com' });

    await deleteFormSubmission(deps, {
      tenantId,
      formId,
      submissionId: 's1',
    });

    expect(removed.sort()).toEqual([
      '/uploads/forms/one.pdf',
      '/uploads/forms/two.pdf',
    ]);
    expect(formSubmissionRepository.submissions.map((s) => s.id)).toEqual([
      's2',
    ]);
  });

  it('keeps a file another answer still names', async () => {
    const { deps, formSubmissionRepository, removed } = await setup();
    await answer(formSubmissionRepository, 's1', { cv: cv('shared') });
    await answer(formSubmissionRepository, 's2', { cv: cv('shared') });

    await deleteFormSubmission(deps, { tenantId, formId, submissionId: 's1' });

    expect(removed).toEqual([]);
  });

  it('still answers "deleted" when a file cannot be removed — the sweep takes it later', async () => {
    const { deps, formSubmissionRepository, removed } = await setup([
      '/uploads/forms/stuck.pdf',
    ]);
    await answer(formSubmissionRepository, 's1', {
      cv: cv('stuck'),
      portfolio: cv('fine'),
    });

    await expect(
      deleteFormSubmission(deps, { tenantId, formId, submissionId: 's1' }),
    ).resolves.toBeUndefined();

    expect(formSubmissionRepository.submissions).toHaveLength(0);
    expect(removed).toEqual(['/uploads/forms/fine.pdf']);
  });

  it('removes no file for an answer that is not there', async () => {
    const { deps, removed } = await setup();

    await expect(
      deleteFormSubmission(deps, { tenantId, formId, submissionId: 'nope' }),
    ).rejects.toBeInstanceOf(FormSubmissionNotFoundError);
    expect(removed).toEqual([]);
  });

  it('deletes nothing when the answer belongs to another form', async () => {
    const { deps, formSubmissionRepository, removed } = await setup();
    await deps.formRepository.add(
      Form.create({ id: 'form-2', tenantId, siteId, name: 'Altro' }),
    );
    await answer(formSubmissionRepository, 's1', { cv: cv('one') });

    await expect(
      deleteFormSubmission(deps, {
        tenantId,
        formId: 'form-2',
        submissionId: 's1',
      }),
    ).rejects.toBeInstanceOf(FormSubmissionNotFoundError);
    expect(formSubmissionRepository.submissions).toHaveLength(1);
    expect(removed).toEqual([]);
  });

  it('is not found for a form of another tenant, deleting nothing', async () => {
    const { deps, formSubmissionRepository, removed } = await setup();
    await answer(formSubmissionRepository, 's1', { cv: cv('one') });

    await expect(
      deleteFormSubmission(deps, {
        tenantId: 'tenant-2',
        formId,
        submissionId: 's1',
      }),
    ).rejects.toBeInstanceOf(FormNotFoundError);
    expect(formSubmissionRepository.submissions).toHaveLength(1);
    expect(removed).toEqual([]);
  });

  it('is not found for a form that is not there, deleting nothing', async () => {
    const { deps, formSubmissionRepository } = await setup();
    await answer(formSubmissionRepository, 's1', { cv: cv('one') });

    await expect(
      deleteFormSubmission(deps, {
        tenantId,
        formId: 'other-form',
        submissionId: 's1',
      }),
    ).rejects.toBeInstanceOf(FormNotFoundError);
    expect(formSubmissionRepository.submissions).toHaveLength(1);
  });
});
