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
  // The captcha hands its token over a moment after the page loads; a
  // submit before that is refused, as it is for a person that quick.
  await expect(
    page.locator('.kometio-form [name="cf-turnstile-response"]'),
  ).not.toHaveValue('');
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
