import { fileDownloadBlockContract } from '@kometio/shared-types';
import { FieldBuilder } from '../field-types';
import { coreBlock } from '../define-core-block';

/**
 * A file from the library, as a link that downloads it — a price list, a
 * menu, a brochure (ADR-0070 is what let the library hold them).
 */
export const fileDownloadBlock = coreBlock(fileDownloadBlockContract, {
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
});
