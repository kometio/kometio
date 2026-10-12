import { fileListBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/** Several downloads under one title — each one a File download block. */
export const fileListBlock = coreBlock(fileListBlockContract, {
  label: 'blocks.fileList.label',
  category: 'media',
  icon: 'files',
  defaultProps: { title: '' },
  fields: [
    {
      kind: 'text',
      key: 'title',
      translatable: true,
      inlineEditable: true,
      label: 'blocks.fileList.fields.title.fieldLabel',
    },
  ],
  isContainer: true,
  allowedChildTypes: ['FileDownload'],
});
