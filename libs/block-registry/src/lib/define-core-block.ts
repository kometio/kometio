import type { BlockContract, BlockContractProps } from '@kometio/shared-types';
import type { BlockDescriptor } from './field-types';

/**
 * What a core block's descriptor says that its contract does not: how the
 * editor offers it. The type, the style defaults and — unless it says
 * otherwise — which properties are stylable come from the contract
 * (ADR-0115), so they are not written a second time.
 */
export type CoreBlockConfig<Props> = Omit<
  BlockDescriptor<Props>,
  'type' | 'defaultStyle'
>;

/**
 * The descriptor of a core block: the editor's half, built on the contract
 * that the site and the API read.
 *
 * - `type` is the contract's, so a descriptor cannot name a block that has
 *   no contract and a rename is one edit.
 * - `defaultStyle` is the contract's `style`, which is what the site falls
 *   back to; the editor shows the same values as placeholders.
 * - `stylableProperties` defaults to the keys of that `style`: a block that
 *   declares a default for a property offers it. A block that has defaults
 *   for the site and no style panel in the editor (Anchor's `maxWidth`)
 *   says so with `stylableProperties: []`.
 *
 * `defaultProps` is typed by the contract's schema; that it also satisfies
 * it at run time is held by `block-declaration.spec.ts`.
 */
export function coreBlock<Contract extends BlockContract>(
  contract: Contract,
  config: CoreBlockConfig<BlockContractProps<Contract>>,
): BlockDescriptor<BlockContractProps<Contract>> {
  return {
    ...config,
    type: contract.type,
    stylableProperties:
      config.stylableProperties ?? Object.keys(contract.style ?? {}),
    defaultStyle: contract.style,
  };
}
