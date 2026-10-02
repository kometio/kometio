import type {
  WordPressExportChannel,
  WordPressExportItem,
  WordPressExportReaderPort,
} from '@kometio/ports';
import { AcfSchemaReader } from './acf-schema';
import { readWxr } from './read-wxr';

/**
 * `WordPressExportReaderPort` over a WXR file.
 *
 * A thin shell over `readWxr`, which knows about WordPress's XML and
 * nothing about what it is for — so a second source of the same shape,
 * the plugin the plan leaves in backlog, implements the port without
 * touching either.
 *
 * The one thing it does on the way past is assemble the field schema:
 * the definitions arrive as ordinary items in the same stream, and
 * gathering them here means a caller never has to know they were in
 * there.
 */
export class WxrExportReader implements WordPressExportReaderPort {
  async read(
    filePath: string,
    onItem: (item: WordPressExportItem) => void,
    options: { keepMetaValues?: readonly string[] } = {},
  ): Promise<WordPressExportChannel> {
    const acf = new AcfSchemaReader();
    const channel = await readWxr(
      filePath,
      (item) => {
        acf.accept(item);
        onItem(item);
      },
      options,
    );
    return { ...channel, acfSchema: acf.build() };
  }
}
