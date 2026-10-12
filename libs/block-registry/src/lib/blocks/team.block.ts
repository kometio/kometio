import { teamBlockContract } from '@kometio/shared-types';
import { coreBlock } from '../define-core-block';
import { displayField } from '../fields/display-field';

export const teamBlock = coreBlock(teamBlockContract, {
  label: 'blocks.team.label',
  category: 'socialProof',
  icon: 'users',
  defaultProps: { display: 'grid' },
  fields: [displayField],
  isContainer: true,
  allowedChildTypes: ['TeamMember'],
});
