import type { VideoPlaylistProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';

/**
 * Several videos, one playing at a time, picked from a list of their
 * titles. Each video is a Video embed block, and its caption is its title
 * in the list.
 */
export const videoPlaylistBlock: BlockDescriptor<VideoPlaylistProps> = {
  type: 'VideoPlaylist',
  label: 'blocks.videoPlaylist.label',
  category: 'media',
  icon: 'list-video',
  defaultProps: {},
  fields: [],
  isContainer: true,
  rendersFromChildren: true,
  allowedChildTypes: ['VideoEmbed'],
  stylableProperties: [...BlockStyleRegistry.STANDARD, 'gap'],
  defaultStyle: BLOCK_STYLE_DEFAULTS.VideoPlaylist,
};
