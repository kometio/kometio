import type { FileDownloadProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import { FieldBuilder, type BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * A file from the library, as a link that downloads it — a price list, a
 * menu, a brochure (ADR-0070 is what let the library hold them).
 */
export const fileDownloadBlock: BlockDescriptor<FileDownloadProps> = {
  type: 'FileDownload',
  label: 'blocks.fileDownload.label',
  category: 'media',
  icon: 'file-down',
  defaultProps: { file: null, label: '', showDetails: true },
  fields: [
    FieldBuilder.custom(
      'file',
      'blocks.fileDownload.fields.file.fieldLabel',
      'file',
    ),
    {
      kind: 'text',
      key: 'label',
      translatable: true,
      label: 'blocks.fileDownload.fields.label.fieldLabel',
    },
    {
      kind: 'boolean',
      key: 'showDetails',
      label: 'blocks.fileDownload.fields.showDetails.fieldLabel',
    },
  ],
  stylableProperties: [
    ...BlockStyleRegistry.STANDARD,
    'borderWidth',
    'borderStyle',
    'borderColor',
  ],
  defaultStyle: BLOCK_STYLE_DEFAULTS.FileDownload,
};
