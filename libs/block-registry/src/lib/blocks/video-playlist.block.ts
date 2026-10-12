import { videoPlaylistBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';

/**
 * Several videos, one playing at a time, picked from a list of their
 * titles. Each video is a Video embed block, and its caption is its title
 * in the list.
 */
export const videoPlaylistBlock = coreBlock(videoPlaylistBlockContract, {
  label: 'blocks.videoPlaylist.label',
  category: 'media',
  icon: 'list-video',
  defaultProps: {},
  fields: [],
  isContainer: true,
  rendersFromChildren: true,
  allowedChildTypes: ['VideoEmbed'],
});
