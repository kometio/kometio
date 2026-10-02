import {
  expect,
  type FrameLocator,
  type Locator,
  type Page,
} from '@playwright/test';
import type { EditorCopy } from './editor-copy';

/**
 * The canvas editor as a person sees it: the page drawn in an iframe
 * served by the public site, a rail down the left that opens Add (the
 * block palette) or Layers beside it, and Properties on the right.
 */
export class CanvasEditor {
  readonly canvas: FrameLocator;

  constructor(
    private readonly page: Page,
    private readonly copy: EditorCopy,
  ) {
    this.canvas = page.frameLocator(
      `iframe[title="${copy.t('canvas.previewFrameTitle')}"]`,
    );
  }

  /**
   * Waits until the canvas has loaded the page, which the editor shows by
   * taking its "Loading the page…" away and turning the palette on.
   */
  async waitUntilLoaded(): Promise<void> {
    // The editor itself, a preview token and the page: more than a
    // locator's default five seconds on a cold dev server.
    await expect(
      this.page.getByTitle(this.copy.t('canvas.previewFrameTitle')),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      this.page.getByText(this.copy.t('canvas.loadingPage')),
    ).toBeHidden({
      timeout: 15_000,
    });
  }

  /** Where the editor tells its save is done: "Draft saved at …". */
  async waitUntilSaved(): Promise<void> {
    await expect(
      this.page.getByText(
        this.copy.pattern('canvas.status.draftSavedAt', { time: /.+/ }),
      ),
    ).toBeVisible();
  }

  /** The palette, as the left panel's view: the panel opens on Layers, and Add in the rail switches it. */
  async openPalette(): Promise<void> {
    const palette = this.page.getByRole('complementary', {
      name: this.copy.t('canvas.insertBlock'),
    });
    if (!(await palette.isVisible())) {
      await this.page
        .getByRole('navigation', { name: this.copy.t('canvas.rail.label') })
        .getByRole('button', {
          name: this.copy.t('canvas.rail.insert'),
          exact: true,
        })
        .click();
    }
    await expect(palette).toBeVisible();
  }

  /** A block's tile in the palette — not its row in Layers, which bears the same name. Open the palette first. */
  paletteBlock(label: string): Locator {
    return this.page
      .getByRole('complementary', { name: this.copy.t('canvas.insertBlock') })
      .getByRole('button', { name: label, exact: true });
  }

  async insertBlock(label: string): Promise<void> {
    await this.openPalette();
    await this.paletteBlock(label).click();
  }

  /** Double-clicks a text in the canvas, replaces it, and leaves it the way the editor commits it: Escape. */
  async replaceText(current: string, next: string): Promise<void> {
    await this.canvas.getByText(current, { exact: true }).dblclick();
    // The double-click goes to the editor and back before the text turns
    // editable; keys typed in between would land on nothing.
    await expect(this.canvas.locator('[contenteditable="true"]')).toBeFocused();
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.type(next);
    await this.page.keyboard.press('Escape');
  }

  async publish(): Promise<void> {
    await this.page
      .getByRole('button', {
        name: this.copy.t('canvas.publish'),
        exact: true,
      })
      .click();
    await expect(
      this.page.getByText(this.copy.t('pages.editor.published'), {
        exact: true,
      }),
    ).toBeVisible();
  }
}
