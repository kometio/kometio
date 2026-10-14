import { expect, test } from './support/test';

/**
 * Publishing at a moment (docs/adr/0135), asked through the editor the way a
 * person asks: from the Page menu, with a date and an hour; the bar says it,
 * the server holds it, and taking it back leaves the page as it was. That a
 * tick of the API then publishes it is the integration suite's, which can
 * move the clock; here the point is the screen and the record behind it.
 */
test('a page is scheduled from its menu, shown on the bar, and taken back', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const { group, translation } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: `programmata-${uniqueName}`,
    title: `Programmata ${uniqueName}`,
    content: [],
  });
  cleanup.add(() => api.deletePage(group.id));
  expect(translation?.id).toBeTruthy();

  // Two days ahead at ten, in the browser's own zone, which is the machine's.
  const when = new Date();
  when.setDate(when.getDate() + 2);
  when.setHours(10, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  const fieldValue = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`;

  await page.goto(`page-groups/${group.id}`);
  // The page's own actions are in the Page menu and, again, under "This
  // page" in the properties: either opens the same dialog.
  await page
    .getByRole('button', {
      name: copy.t('pages.schedule.menuOpen'),
      exact: true,
    })
    .first()
    .click();
  const dialog = page.getByRole('dialog', {
    name: copy.t('pages.schedule.title'),
  });
  await dialog.getByLabel(copy.t('pages.schedule.whenLabel')).fill(fieldValue);
  await dialog
    .getByRole('button', { name: copy.t('pages.schedule.submit'), exact: true })
    .click();
  await expect(dialog).toBeHidden();

  // The bar says it, and it is the way back into the dialog.
  const marker = copy.t('pages.schedule.badge', { when: '@' }).split('@')[0];
  const badge = page.getByRole('button', { name: new RegExp(`^${marker}`) });
  await expect(badge).toBeVisible();
  const [scheduled] = await api.pageTranslations(group.id);
  expect(scheduled?.status).toBe('draft');
  expect(new Date(scheduled?.scheduledPublishAt ?? '').getTime()).toBe(
    when.getTime(),
  );

  await badge.click();
  const again = page.getByRole('dialog', {
    name: copy.t('pages.schedule.title'),
  });
  await expect(
    again.getByLabel(copy.t('pages.schedule.whenLabel')),
  ).toHaveValue(fieldValue);
  await again
    .getByRole('button', { name: copy.t('pages.schedule.remove') })
    .click();
  await expect(again).toBeHidden();
  await expect(badge).toHaveCount(0);
  const [taken] = await api.pageTranslations(group.id);
  expect(taken?.scheduledPublishAt).toBeNull();
});
