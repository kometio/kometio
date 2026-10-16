import { widgetState } from './support/captcha';
import { environment } from './support/environment';
import { expect, test } from './support/test';

test('a form shows a field only when an earlier answer calls for it, saves the answer and emails every address', async ({
  page,
  api,
  cleanup,
  copy,
  mailpit,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const recipients = [
    `${uniqueName}-sales@example.com`,
    `${uniqueName}-support@example.com`,
  ];
  cleanup.add(async () => {
    for (const address of recipients) {
      await mailpit.delete(await mailpit.messagesTo(address));
    }
  });

  // The fields exist already; the condition and the addresses are set in
  // the editor, the way a person sets them.
  const form = await api.createForm(site.id, uniqueName);
  cleanup.add(() => api.deleteForm(form.id));
  await api.updateForm(form.id, {
    name: uniqueName,
    notificationEmails: [],
    fields: [
      {
        id: 'reason',
        label: 'Reason',
        type: 'select',
        required: true,
        options: ['Quote', 'Other'],
      },
      { id: 'details', label: 'Details', type: 'text', required: true },
      { id: 'email', label: 'Your email', type: 'email', required: true },
    ],
  });

  await page.goto(`forms/${form.id}`);
  await page.locator('#field-condition-details').click();
  await page
    .getByRole('option', {
      name: copy.t('forms.editor.conditionWhen', { field: 'Reason' }),
    })
    .click();
  await page
    .getByRole('combobox', {
      name: copy.t('forms.editor.conditionAnswerLabel'),
    })
    .click();
  await page
    .getByRole('option', {
      name: copy.t('forms.editor.conditionIs', { option: 'Other' }),
    })
    .click();
  await page
    .getByLabel(copy.t('forms.editor.notificationEmailAddress', { number: 1 }))
    .fill(recipients[0]);
  await page
    .getByRole('button', { name: copy.t('forms.editor.addNotificationEmail') })
    .click();
  await page
    .getByLabel(copy.t('forms.editor.notificationEmailAddress', { number: 2 }))
    .fill(recipients[1]);
  await page
    .getByRole('button', { name: copy.t('forms.editor.save'), exact: true })
    .click();
  await expect(page.getByText(copy.t('forms.editor.saved'))).toBeVisible();

  const { translation } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: uniqueName,
    title: uniqueName,
    content: [
      {
        type: 'Form',
        props: { form: { formId: form.id, formName: uniqueName } },
      },
    ],
  });
  cleanup.add(() => api.deletePage(translation.pageGroupId));
  await api.publishTranslation(translation.id);

  await page.goto(
    `${environment.publicSiteUrl}${site.defaultLocale}/${uniqueName}`,
  );
  const reason = page.getByLabel('Reason');
  const details = page.getByLabel('Details');
  await expect(details).toBeHidden();
  await reason.selectOption('Other');
  await expect(details).toBeVisible();
  await reason.selectOption('Quote');
  await expect(details).toBeHidden();
  await reason.selectOption('Other');
  await details.fill('Three rooms, second floor');
  await page.getByLabel('Your email').fill(`${uniqueName}-visitor@example.com`);
  // The widget solves its challenge once the visitor has started on the form,
  // and a submit before it is done is refused, as it is for a person that
  // quick.
  await expect
    .poll(() => widgetState(page.locator('.kometio-form altcha-widget')), {
      timeout: 30_000,
    })
    .toBe('verified');
  // By its type, not its text: the button speaks the site's language.
  await page.locator('.kometio-form button[type="submit"]').click();
  await expect(page.getByRole('status')).toBeVisible();

  await expect
    .poll(async () => (await api.formSubmissions(form.id))[0]?.payload)
    .toMatchObject({ reason: 'Other', details: 'Three rooms, second floor' });
  for (const address of recipients) {
    await expect
      .poll(async () => (await mailpit.messagesTo(address)).length)
      .toBe(1);
  }
});

test('a form the owner has turned the captcha off for draws no widget and takes an answer, and one that was never asked still has it', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const emailField = [
    { id: 'email', label: 'Your email', type: 'email', required: true },
  ] as const;
  const asking = await api.createForm(site.id, `${uniqueName}-asking`);
  cleanup.add(() => api.deleteForm(asking.id));
  await api.updateForm(asking.id, {
    name: `${uniqueName}-asking`,
    notificationEmails: [],
    fields: [...emailField],
  });
  const form = await api.createForm(site.id, uniqueName);
  cleanup.add(() => api.deleteForm(form.id));
  await api.updateForm(form.id, {
    name: uniqueName,
    notificationEmails: [],
    fields: [...emailField],
  });

  // The switch of the form's own screen, the way an owner turns it (docs/adr/0145).
  await page.goto(`forms/${form.id}`);
  await page
    .getByRole('switch', { name: copy.t('forms.editor.captchaLabel') })
    .click();
  await page
    .getByRole('button', { name: copy.t('forms.editor.save'), exact: true })
    .click();
  await expect(page.getByText(copy.t('forms.editor.saved'))).toBeVisible();

  for (const [slug, id] of [
    [uniqueName, form.id],
    [`${uniqueName}-asking`, asking.id],
  ] as const) {
    const { translation } = await api.createPage({
      siteId: site.id,
      locale: site.defaultLocale,
      slug,
      title: slug,
      content: [
        { type: 'Form', props: { form: { formId: id, formName: slug } } },
      ],
    });
    cleanup.add(() => api.deletePage(translation.pageGroupId));
    await api.publishTranslation(translation.id);
  }

  await page.goto(
    `${environment.publicSiteUrl}${site.defaultLocale}/${uniqueName}`,
  );
  await expect(page.locator('.kometio-form')).toBeVisible();
  await expect(page.locator('.kometio-form [data-kometio-altcha]')).toHaveCount(
    0,
  );
  await page.getByLabel('Your email').fill(`${uniqueName}-visitor@example.com`);
  await page.locator('.kometio-form button[type="submit"]').click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect
    .poll(async () => (await api.formSubmissions(form.id)).length)
    .toBe(1);

  await page.goto(
    `${environment.publicSiteUrl}${site.defaultLocale}/${uniqueName}-asking`,
  );
  await expect(page.locator('.kometio-form [data-kometio-altcha]')).toHaveCount(
    1,
  );
});
