import { describe, expect, it } from 'vitest';
import {
  FormNotFoundError,
  InvalidCaptchaError,
  InvalidFormSubmissionError,
  PageTranslation,
} from '@kometio/domain-core';
import { createForm } from './create-form.use-case';
import { updateForm } from './update-form.use-case';
import { getPublicForm } from './get-public-form.use-case';
import { submitForm } from './submit-form.use-case';
import {
  InMemoryFormRepository,
  InMemoryFormSubmissionRepository,
  InMemoryPageTranslationRepository,
  InMemorySiteRepository,
  buildSite,
} from '@kometio/testing';
import { FakeAttachmentStorage, FakeEmailPort } from '@kometio/testing';
import { FakeDeploymentLocale } from '@kometio/testing';
import { FakeCaptchaPort } from '@kometio/testing';
import { FailingNewsletterPort, FakeNewsletterPort } from '@kometio/testing';

describe('getPublicForm and submitForm', () => {
  const tenantId = 'tenant-1';
  const siteId = 'site-1';
  const captchaToken = 'valid-token';

  function setup() {
    const formRepository = new InMemoryFormRepository();
    const formSubmissionRepository = new InMemoryFormSubmissionRepository();
    const emailPort = new FakeEmailPort();
    const captchaPort = new FakeCaptchaPort();
    const newsletterPort = new FakeNewsletterPort();
    const pageTranslationRepository = new InMemoryPageTranslationRepository();
    const attachmentStorage = new FakeAttachmentStorage();
    return {
      formRepository,
      siteRepository: new InMemorySiteRepository(buildSite()),
      formSubmissionRepository,
      emailPort,
      captchaPort,
      newsletterPort,
      pageTranslationRepository,
      attachmentStorage,
      deploymentLocale: new FakeDeploymentLocale(),
    };
  }

  /** What creating and editing a form needs, whatever else a test swapped. */
  type FormDeps = Pick<
    ReturnType<typeof setup>,
    'formRepository' | 'siteRepository'
  >;

  async function buildFormWithFields(deps: FormDeps) {
    const form = await createForm(deps, { tenantId, siteId, name: 'Contatti' });
    return updateForm(deps, {
      tenantId,
      formId: form.id,
      name: 'Contatti',
      fields: [
        { id: 'email', label: 'Email', type: 'email', required: true },
        { id: 'note', label: 'Note', type: 'textarea', required: false },
        {
          id: 'consent',
          label: 'Accetto la privacy',
          type: 'checkbox',
          required: true,
        },
      ],
      steps: [],
      notificationEmails: ['owner@example.com'],
    });
  }

  async function buildFormWithNewsletterField(deps: FormDeps) {
    const form = await createForm(deps, { tenantId, siteId, name: 'Contatti' });
    return updateForm(deps, {
      tenantId,
      formId: form.id,
      name: 'Contatti',
      fields: [
        { id: 'email', label: 'Email', type: 'email', required: true },
        {
          id: 'newsletter',
          label: 'Iscrivimi alla newsletter',
          type: 'newsletter-consent',
          required: false,
        },
      ],
      steps: [],
      notificationEmails: [],
    });
  }

  async function buildPage(
    deps: ReturnType<typeof setup>,
    id: string,
    onSiteId = siteId,
  ) {
    const translation = PageTranslation.create({
      id,
      tenantId,
      siteId: onSiteId,
      pageGroupId: `group-of-${id}`,
      locale: 'it',
      slug: 'contatti',
      seoMeta: { title: 'Contatti', description: '' },
      createdBy: null,
    });
    await deps.pageTranslationRepository.add(translation, null);
    return translation;
  }

  it('getPublicForm returns fields but never the notification email', async () => {
    const deps = setup();
    const form = await buildFormWithFields(deps);

    const publicForm = await getPublicForm(deps, { tenantId, formId: form.id });

    expect(publicForm.name).toBe('Contatti');
    expect(publicForm.fields).toHaveLength(3);
    expect(publicForm).not.toHaveProperty('notificationEmails');
  });

  it('getPublicForm throws FormNotFoundError for a nonexistent id', async () => {
    const deps = setup();

    await expect(
      getPublicForm(deps, { tenantId, formId: 'does-not-exist' }),
    ).rejects.toThrow(FormNotFoundError);
  });

  it.each([
    ['it', 'Nuova risposta al modulo'],
    ['en', 'New response to the form'],
    // A language no email is written in: English, not Italian by default.
    ['fr', 'New response to the form'],
  ])(
    'writes the notification in the language of the site (%s), since its recipients are addresses and not accounts that chose one',
    async (siteLocale, subject) => {
      const deps = setup();
      const form = await buildFormWithFields(deps);

      await submitForm(
        { ...deps, deploymentLocale: new FakeDeploymentLocale(siteLocale) },
        {
          tenantId,
          formId: form.id,
          pageId: null,
          values: { email: 'visitor@example.com', consent: true },
          honeypot: '',
          captchaToken,
        },
      );

      expect(deps.emailPort.sentEmails[0].subject).toContain(subject);
    },
  );

  it('submitForm saves the submission and sends a notification email', async () => {
    const deps = setup();
    const form = await buildFormWithFields(deps);

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: 'page-1',
      values: { email: 'visitor@example.com', consent: true },
      honeypot: '',
      captchaToken,
    });

    expect(deps.formSubmissionRepository.submissions).toHaveLength(1);
    expect(deps.formSubmissionRepository.submissions[0].payload).toEqual({
      email: 'visitor@example.com',
      consent: true,
    });
    expect(deps.emailPort.sentEmails).toHaveLength(1);
    expect(deps.emailPort.sentEmails[0].to).toBe('owner@example.com');
    expect(deps.emailPort.sentEmails[0].html).toContain('visitor@example.com');
    // 'page-1' is not a page of this site, so no origin is recorded — see
    // the three tests at the end of this file.
    expect(deps.formSubmissionRepository.submissions[0].pageId).toBeNull();
  });

  it('submitForm formats a file field as its filename and URL in the notification email', async () => {
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Candidature',
    });
    await updateForm(deps, {
      tenantId,
      formId: form.id,
      name: 'Candidature',
      fields: [
        { id: 'email', label: 'Email', type: 'email', required: true },
        { id: 'cv', label: 'Curriculum', type: 'file', required: false },
      ],
      steps: [],
      notificationEmails: ['hr@example.com'],
    });

    const cv = await deps.attachmentStorage.upload({
      formId: form.id,
      filename: 'cv.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      data: new Uint8Array(),
    });

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: null,
      values: { email: 'candidato@example.com', cv },
      honeypot: '',
      captchaToken,
    });

    expect(deps.emailPort.sentEmails[0].html).toContain('cv.pdf');
    expect(deps.emailPort.sentEmails[0].html).toContain(cv.url);
  });

  it('submitForm shows a dash for a file field left empty in the notification email', async () => {
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Candidature',
    });
    await updateForm(deps, {
      tenantId,
      formId: form.id,
      name: 'Candidature',
      fields: [
        { id: 'email', label: 'Email', type: 'email', required: true },
        { id: 'cv', label: 'Curriculum', type: 'file', required: false },
      ],
      steps: [],
      notificationEmails: ['hr@example.com'],
    });

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: null,
      values: { email: 'candidato@example.com', cv: '' },
      honeypot: '',
      captchaToken,
    });

    expect(deps.emailPort.sentEmails[0].html).not.toContain('[object Object]');
  });

  it('submitForm rejects a missing required field', async () => {
    const deps = setup();
    const form = await buildFormWithFields(deps);

    await expect(
      submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: { consent: true },
        honeypot: '',
        captchaToken,
      }),
    ).rejects.toThrow(InvalidFormSubmissionError);
    expect(deps.formSubmissionRepository.submissions).toHaveLength(0);
  });

  it('submitForm rejects an unchecked required checkbox', async () => {
    const deps = setup();
    const form = await buildFormWithFields(deps);

    await expect(
      submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: { email: 'visitor@example.com', consent: false },
        honeypot: '',
        captchaToken,
      }),
    ).rejects.toThrow(InvalidFormSubmissionError);
  });

  it('submitForm silently accepts a honeypot-filled submission without saving or notifying', async () => {
    const deps = setup();
    const form = await buildFormWithFields(deps);

    await expect(
      submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: {},
        honeypot: 'i-am-a-bot',
        // Deliberately blank: the honeypot short-circuit (docs/adr/0015)
        // must return before the CAPTCHA check ever runs, so an invalid
        // token here must not turn into a visible InvalidCaptchaError.
        captchaToken: '',
      }),
    ).resolves.not.toThrow();

    expect(deps.formSubmissionRepository.submissions).toHaveLength(0);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('submitForm rejects an invalid or missing CAPTCHA token', async () => {
    const deps = setup();
    const form = await buildFormWithFields(deps);

    await expect(
      submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: { email: 'visitor@example.com', consent: true },
        honeypot: '',
        captchaToken: '',
      }),
    ).rejects.toThrow(InvalidCaptchaError);
    expect(deps.formSubmissionRepository.submissions).toHaveLength(0);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('submitForm throws FormNotFoundError for a nonexistent form', async () => {
    const deps = setup();

    await expect(
      submitForm(deps, {
        tenantId,
        formId: 'does-not-exist',
        pageId: null,
        values: {},
        honeypot: '',
        captchaToken,
      }),
    ).rejects.toThrow(FormNotFoundError);
  });

  it('submitForm does not send an email when the form has no notification address', async () => {
    const deps = setup();
    const form = await createForm(deps, {
      tenantId,
      siteId,
      name: 'Senza notifica',
    });

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: null,
      values: {},
      honeypot: '',
      captchaToken,
    });

    expect(deps.formSubmissionRepository.submissions).toHaveLength(1);
    expect(deps.emailPort.sentEmails).toHaveLength(0);
  });

  it('submitForm subscribes the submitted email when the newsletter-consent field is checked', async () => {
    const deps = setup();
    const form = await buildFormWithNewsletterField(deps);

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: null,
      values: { email: 'visitor@example.com', newsletter: true },
      honeypot: '',
      captchaToken,
    });

    expect(deps.newsletterPort.subscribedEmails).toEqual([
      'visitor@example.com',
    ]);
  });

  it('submitForm does not subscribe when the newsletter-consent field is left unchecked', async () => {
    const deps = setup();
    const form = await buildFormWithNewsletterField(deps);

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: null,
      values: { email: 'visitor@example.com', newsletter: false },
      honeypot: '',
      captchaToken,
    });

    expect(deps.newsletterPort.subscribedEmails).toHaveLength(0);
  });

  it('submitForm still saves the submission even if the newsletter provider fails', async () => {
    const deps = { ...setup(), newsletterPort: new FailingNewsletterPort() };
    const form = await buildFormWithNewsletterField(deps);

    await expect(
      submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: { email: 'visitor@example.com', newsletter: true },
        honeypot: '',
        captchaToken,
      }),
    ).resolves.not.toThrow();

    expect(deps.formSubmissionRepository.submissions).toHaveLength(1);
  });

  it('submitForm records the page the visitor filled the form on', async () => {
    const deps = setup();
    const form = await buildFormWithFields(deps);
    const page = await buildPage(deps, 'translation-1');

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: page.id,
      values: { email: 'visitor@example.com', consent: true },
      honeypot: '',
      captchaToken,
    });

    expect(deps.formSubmissionRepository.submissions[0].pageId).toBe(
      'translation-1',
    );
  });

  it('submitForm refuses a page belonging to a different site', async () => {
    // The endpoint is unauthenticated and the id arrives in the body, so
    // anyone can name any page. A foreign key would accept this one — it
    // is a real row — and the submission would be labelled with a page
    // its owner cannot see.
    const deps = setup();
    const form = await buildFormWithFields(deps);
    const elsewhere = await buildPage(deps, 'translation-2', 'another-site');

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: elsewhere.id,
      values: { email: 'visitor@example.com', consent: true },
      honeypot: '',
      captchaToken,
    });

    expect(deps.formSubmissionRepository.submissions[0].pageId).toBeNull();
  });

  it('submitForm keeps the answers when the page id names nothing', async () => {
    // An invented id must not cost a real submission: it would be a
    // foreign-key violation, and the visitor would see a failure over a
    // field nobody needs.
    const deps = setup();
    const form = await buildFormWithFields(deps);

    await submitForm(deps, {
      tenantId,
      formId: form.id,
      pageId: 'not-a-page',
      values: { email: 'visitor@example.com', consent: true },
      honeypot: '',
      captchaToken,
    });

    expect(deps.formSubmissionRepository.submissions).toHaveLength(1);
    expect(deps.formSubmissionRepository.submissions[0].pageId).toBeNull();
  });

  describe('conditional fields (one condition per field)', () => {
    async function buildConditionalForm(deps: ReturnType<typeof setup>) {
      const form = await createForm(deps, {
        tenantId,
        siteId,
        name: 'Contatti',
      });
      return updateForm(deps, {
        tenantId,
        formId: form.id,
        name: 'Contatti',
        fields: [
          {
            id: 'reason',
            label: 'Motivo',
            type: 'select',
            required: true,
            options: ['Preventivo', 'Altro'],
          },
          {
            id: 'details',
            label: 'Specifica',
            type: 'text',
            required: true,
            showWhen: { fieldId: 'reason', equals: 'Altro' },
          },
        ],
        steps: [],
        notificationEmails: ['owner@example.com'],
      });
    }

    it('does not require a field the visitor was never shown', async () => {
      const deps = setup();
      const form = await buildConditionalForm(deps);

      await submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: { reason: 'Preventivo' },
        honeypot: '',
        captchaToken,
      });

      expect(deps.formSubmissionRepository.submissions).toHaveLength(1);
    });

    it('still requires it once it is shown', async () => {
      const deps = setup();
      const form = await buildConditionalForm(deps);

      await expect(
        submitForm(deps, {
          tenantId,
          formId: form.id,
          pageId: null,
          values: { reason: 'Altro' },
          honeypot: '',
          captchaToken,
        }),
      ).rejects.toThrow(InvalidFormSubmissionError);
    });

    it('keeps neither the answer to a hidden field nor a key that names no field', async () => {
      const deps = setup();
      const form = await buildConditionalForm(deps);

      await submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: {
          reason: 'Preventivo',
          details: 'typed before switching the reason',
          injected: 'not a field of this form',
        },
        honeypot: '',
        captchaToken,
      });

      expect(deps.formSubmissionRepository.submissions[0].payload).toEqual({
        reason: 'Preventivo',
      });
      expect(deps.emailPort.sentEmails[0].html).not.toContain(
        'typed before switching the reason',
      );
    });
  });

  describe('several notification addresses', () => {
    it('emails each address on its own, so nobody sees who else is on the list', async () => {
      const deps = setup();
      const created = await buildFormWithFields(deps);
      const form = await updateForm(deps, {
        tenantId,
        formId: created.id,
        name: 'Contatti',
        fields: created.fields,
        steps: [],
        notificationEmails: ['owner@example.com', 'sales@example.com'],
      });

      await submitForm(deps, {
        tenantId,
        formId: form.id,
        pageId: null,
        values: { email: 'visitor@example.com', consent: true },
        honeypot: '',
        captchaToken,
      });

      expect(deps.emailPort.sentEmails.map((email) => email.to)).toEqual([
        'owner@example.com',
        'sales@example.com',
      ]);
    });

    it('still tries every address when one fails, and hands the failure back instead of failing the visitor', async () => {
      const deps = setup();
      const delivered: string[] = [];
      const emailPort = {
        async sendEmail({ to }: { to: string }) {
          if (to === 'broken@example.com') throw new Error('SMTP refused');
          delivered.push(to);
        },
      };
      const created = await buildFormWithFields(deps);
      await updateForm(deps, {
        tenantId,
        formId: created.id,
        name: 'Contatti',
        fields: created.fields,
        steps: [],
        notificationEmails: ['broken@example.com', 'sales@example.com'],
      });

      const result = await submitForm(
        { ...deps, emailPort },
        {
          tenantId,
          formId: created.id,
          pageId: null,
          values: { email: 'visitor@example.com', consent: true },
          honeypot: '',
          captchaToken,
        },
      );

      expect(delivered).toEqual(['sales@example.com']);
      expect(result.undeliveredNotifications).toEqual([
        { to: 'broken@example.com', reason: new Error('SMTP refused') },
      ]);
      // Saved, and saved once: the visitor is not told to send it again.
      expect(deps.formSubmissionRepository.submissions).toHaveLength(1);
    });
  });

  describe('what an answer may be', () => {
    async function buildForm(deps: ReturnType<typeof setup>) {
      const form = await createForm(deps, {
        tenantId,
        siteId,
        name: 'Candidature',
      });
      return updateForm(deps, {
        tenantId,
        formId: form.id,
        name: 'Candidature',
        fields: [
          { id: 'name', label: 'Nome', type: 'text', required: true },
          {
            id: 'role',
            label: 'Ruolo',
            type: 'select',
            required: false,
            options: ['Sviluppo', 'Design'],
          },
          { id: 'cv', label: 'Curriculum', type: 'file', required: false },
        ],
        steps: [],
        notificationEmails: ['hr@example.com'],
      });
    }

    function submit(
      deps: ReturnType<typeof setup>,
      formId: string,
      values: Record<string, unknown>,
    ) {
      return submitForm(deps, {
        tenantId,
        formId,
        pageId: null,
        values,
        honeypot: '',
        captchaToken,
      });
    }

    it.each([{}, [], 42, true])(
      'refuses %j in a text field, which would print as nonsense in the email',
      async (value) => {
        const deps = setup();
        const form = await buildForm(deps);

        await expect(submit(deps, form.id, { name: value })).rejects.toThrow(
          InvalidFormSubmissionError,
        );
        expect(deps.formSubmissionRepository.submissions).toHaveLength(0);
      },
    );

    it('refuses a select answer that is not one of its options', async () => {
      const deps = setup();
      const form = await buildForm(deps);

      await expect(
        submit(deps, form.id, { name: 'Ada', role: 'Direzione' }),
      ).rejects.toThrow(InvalidFormSubmissionError);
    });

    it.each([
      'https://evil.example/cv.pdf',
      'https://files.esempio.test/attachments/another-form/5b0a4c1e-7f3d-4e2a-9c61-2d8e4f1a3b70.pdf',
    ])(
      'refuses a file that is not one of this form’s own attachments: %s',
      async (url) => {
        const deps = setup();
        const form = await buildForm(deps);

        await expect(
          submit(deps, form.id, {
            name: 'Ada',
            cv: { url, filename: 'cv.pdf' },
          }),
        ).rejects.toThrow(InvalidFormSubmissionError);
      },
    );

    it('refuses a path that climbs out from under this form’s attachments', async () => {
      const deps = setup();
      const form = await buildForm(deps);
      const prefix = deps.attachmentStorage.urlPrefixFor(form.id);

      await expect(
        submit(deps, form.id, {
          name: 'Ada',
          cv: { url: `${prefix}../other/x.pdf`, filename: 'cv.pdf' },
        }),
      ).rejects.toThrow(InvalidFormSubmissionError);
    });

    it('still signs up for the newsletter when a notification cannot be sent', async () => {
      const deps = setup();
      const form = await createForm(deps, { tenantId, siteId, name: 'News' });
      await updateForm(deps, {
        tenantId,
        formId: form.id,
        name: 'News',
        fields: [
          { id: 'email', label: 'Email', type: 'email', required: true },
          {
            id: 'newsletter',
            label: 'Iscrivimi',
            type: 'newsletter-consent',
            required: false,
          },
        ],
        steps: [],
        notificationEmails: ['owner@example.com'],
      });
      const emailPort = {
        async sendEmail() {
          throw new Error('SMTP down');
        },
      };

      await submitForm(
        { ...deps, emailPort },
        {
          tenantId,
          formId: form.id,
          pageId: null,
          values: { email: 'visitor@example.com', newsletter: true },
          honeypot: '',
          captchaToken,
        },
      );

      expect(deps.newsletterPort.subscribedEmails).toEqual([
        'visitor@example.com',
      ]);
    });
  });
});
