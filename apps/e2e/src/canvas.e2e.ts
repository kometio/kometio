import type { Page } from '@playwright/test';
import { CanvasEditor } from './support/canvas-editor';
import { expect, test } from './support/test';
import type { Block } from './support/wire-schemas';

function heading(id: string, text: string): Block {
  return { id, type: 'Heading', props: { text, level: 'h2' } };
}

function text(id: string, body: string): Block {
  return { id, type: 'Text', props: { body: `<p>${body}</p>` } };
}

function layerRow(page: Page, blockId: string) {
  return page.locator(`[data-testid="layer-row"][data-block-id="${blockId}"]`);
}

/**
 * What a screen reader is told during a keyboard drag (the editor's own
 * words, use-drag-announcements.ts), and the one sure sign that a key
 * press has been taken: the rows are still animating when it is.
 */
function dragAnnouncement(page: Page) {
  return page.locator('[id^="DndLiveRegion"]');
}

/**
 * dnd-kit measures where every row is a frame or two after a drag starts
 * or moves; an arrow pressed before then has nowhere to go and is dropped.
 * No person presses that fast — a test does, so it waits them out.
 */
async function afterMeasuring(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test('layers reorder by keyboard and by mouse, and the page saves the new order', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const [a, b, c] = ['a', 'b', 'c'].map((suffix) => `${uniqueName}-${suffix}`);
  const { group } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: uniqueName,
    title: uniqueName,
    content: [heading(a, 'One'), heading(b, 'Two'), heading(c, 'Three')],
  });
  cleanup.add(() => api.deletePage(group.id));
  // What the editor says of a Heading in a list of three: also what it says
  // as soon as the row is picked up.
  const movedTo = (position: number) =>
    copy.t('dragAnnouncements.moved', {
      name: copy.t('blocks.heading.label'),
      position,
      total: 3,
    });
  const savedOrder = async () =>
    (await api.pageGroup(group.id)).content.map((block) => block.id);

  await page.goto(`page-groups/${group.id}`);
  await new CanvasEditor(page, copy).waitUntilLoaded();

  // Keyboard: the handle beside a row picks it up with Space, the arrows
  // move it, Space puts it down.
  const handle = layerRow(page, c)
    .locator('..')
    .getByRole('button', {
      name: copy.pattern('canvas.dragLayer', { name: /.*/ }),
    });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(dragAnnouncement(page)).toContainText(movedTo(3));
  await afterMeasuring(page);
  for (const position of [2, 1]) {
    await page.keyboard.press('ArrowUp');
    await expect(dragAnnouncement(page)).toContainText(movedTo(position));
    await afterMeasuring(page);
  }
  await page.keyboard.press('Space');
  await expect.poll(savedOrder).toEqual([c, a, b]);

  // Mouse: the row itself is dragged, below the last one.
  const from = await layerRow(page, a).boundingBox();
  const last = await layerRow(page, b).boundingBox();
  if (!from || !last) throw new Error('The layer rows are not on screen');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, last.y + last.height + 8, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(savedOrder).toEqual([c, b, a]);

  // The canvas follows the saved order.
  await expect(
    new CanvasEditor(page, copy).canvas.getByRole('heading'),
  ).toHaveText(['Three', 'Two', 'One']);
});

test('restoring a header version right after an edit keeps the restored version', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  // The header editor draws the header over a real page in its language.
  const { group } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: uniqueName,
    title: uniqueName,
    content: [],
  });
  cleanup.add(() => api.deletePage(group.id));

  // The header is the site's own, not the test's: whatever it held goes
  // back when the test ends. Its published version is never touched.
  // Text, not Heading: a header offers its own set of blocks, and Heading
  // is not one of them, so it would not be editable there.
  const header = await api.layoutSection(site.id, site.defaultLocale, 'header');
  // Holding a test's blocks already, it is another run's header, not the
  // site's: putting that back at the end would leave test content behind.
  // Two runs of this test at once cannot share one header.
  const borrowed = header.content.some((block) => block.id?.startsWith('e2e-'));
  if (borrowed) {
    throw new Error(
      'The header draft holds e2e blocks: another run of this test is going on, or one was cut short. ' +
        "Wait for it, or set the draft back to the published header (docs/development.md, 'End-to-end tests').",
    );
  }
  cleanup.add(() => api.saveLayoutSectionDraft(header.id, header.content));
  const blockId = `${uniqueName}-title`;
  const restored = `Restored ${uniqueName}`;
  const current = `Current ${uniqueName}`;
  await api.saveLayoutSectionDraft(header.id, [text(blockId, restored)]);
  await api.saveLayoutSectionDraft(header.id, [text(blockId, current)]);

  await page.goto(`layout/header?locale=${site.defaultLocale}`);
  const editor = new CanvasEditor(page, copy);
  await editor.waitUntilLoaded();
  // Restored straight after typing, the way a person undoes a slip. Only
  // sometimes quick enough to catch the edit still in its 300ms debounce
  // (the dialog takes a moment to open): the case is made certain in
  // site-layout-section-editor-view.spec.tsx. What this proves is the end
  // to end: the restored version is what the canvas and the server hold.
  await editor.replaceText(current, `Edited ${uniqueName}`);
  await page
    .getByRole('button', { name: copy.t('pages.versionHistory.open') })
    .click();
  // Newest first: "Current version", then the one saved before it.
  await page
    .getByRole('dialog', { name: copy.t('pages.versionHistory.title') })
    .getByRole('button', { name: copy.t('pages.versionHistory.restore') })
    .first()
    .click();

  await expect(
    editor.canvas.getByText(restored, { exact: true }),
  ).toBeVisible();
  await editor.waitUntilSaved();
  const section = await api.layoutSection(
    site.id,
    site.defaultLocale,
    'header',
  );
  expect(section.content.map((block) => block.props.body)).toEqual([
    `<p>${restored}</p>`,
  ]);
});

test('a canvas whose page does not answer says so, and Retry loads it', async ({
  page,
  api,
  cleanup,
  copy,
  uniqueName,
}) => {
  const site = await api.currentSite();
  const { group } = await api.createPage({
    siteId: site.id,
    locale: site.defaultLocale,
    slug: uniqueName,
    title: uniqueName,
    content: [heading(`${uniqueName}-h`, 'One')],
  });
  cleanup.add(() => api.deletePage(group.id));

  // A preview that loads with nothing listening in it — what an expired
  // token or a page deleted meanwhile gets.
  await page.route('**/preview/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/html',
      body: '<!doctype html><title>Not found</title><p>Not found</p>',
    }),
  );
  await page.goto(`page-groups/${group.id}`);
  const editor = new CanvasEditor(page, copy);
  const headingLabel = copy.t('blocks.heading.label');

  const failure = page
    .getByRole('alert')
    .filter({ hasText: copy.t('canvas.previewError') });
  await expect(failure).toBeVisible({ timeout: 15_000 });
  await editor.openPalette();
  await expect(editor.paletteBlock(headingLabel)).toBeDisabled();

  await page.unroute('**/preview/**');
  await failure.getByRole('button', { name: copy.t('common.retry') }).click();

  await editor.waitUntilLoaded();
  await expect(
    editor.canvas.getByRole('heading', { name: 'One' }),
  ).toBeVisible();
  await expect(editor.paletteBlock(headingLabel)).toBeEnabled();
});
