import type { TeamProps } from '@kometio/shared-types';
import { BLOCK_STYLE_DEFAULTS } from '@kometio/shared-types';
import type { BlockDescriptor } from '../field-types';
import { BlockStyleRegistry } from '../block-style-registry';
import { displayField } from '../fields/display-field';

export const teamBlock: BlockDescriptor<TeamProps> = {
  type: 'Team',
  label: 'blocks.team.label',
  category: 'socialProof',
  icon: 'users',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['TeamMember'],
  stylableProperties: BlockStyleRegistry.STANDARD,
  defaultStyle: BLOCK_STYLE_DEFAULTS.Team,
};
