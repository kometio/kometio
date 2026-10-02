import type { FileListProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/** Several downloads under one title — each one a File download block. */
export const fileListBlock: BlockDescriptor<FileListProps> = {
  type: 'FileList',
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
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.FileList,
};
