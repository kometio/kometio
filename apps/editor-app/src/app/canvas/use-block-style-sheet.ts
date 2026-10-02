import type { MutableRefObject } from 'react';
import {
  buildBlockInstanceRulesCss,
  buildRootBlockSpacingCss,
  type Block,
} from '@kometio/shared-types';
import type { PreviewBridgeState } from './use-preview-bridge';

export interface BlockStyleSheet {
  /**
   * Sends the sheet again, built from `tree` — the draft as it stands when
   * omitted. Called after anything that changes which instances carry a
   * style: an edit to one, and a block arriving with a style of its own (a
   * duplicate, a paste, an undo that brings one back).
   */
  refresh: (tree?: Block[]) => void;
}

/**
 * The block style sheet the iframe shows for the blocks on the page: the
 * rules of each styled instance, and the spacing of the root blocks.
 *
 * The rules of a block TYPE are not here. They are set on the Style page,
 * in another tab, and reach the canvas with the page itself; the layer
 * declaration below keeps their place under an instance's, which is what
 * makes an instance beat its type.
 *
 * A style is a RULE since ADR-0047, not an inline attribute, so rendering a
 * block's fragment does not carry it: whoever puts a styled block on the
 * canvas has to send the sheet too.
 */
export function useBlockStyleSheet(
  bridge: Pick<PreviewBridgeState, 'updateBlockStyleCss'>,
  localBlocksRef: MutableRefObject<Block[]>,
): BlockStyleSheet {
  function refresh(tree?: Block[]): void {
    const blocks = tree ?? localBlocksRef.current;
    const tiers = [
      buildBlockInstanceRulesCss([blocks]),
      // The margins and the entrance animation of a root block are rules
      // on its WRAPPER (`.kometio-rb-<id>`), which the page renders beside the
      // instance rules. Without them a root block given a margin in the
      // canvas, or arriving with one, kept the default until a reload.
      buildRootBlockSpacingCss(blocks),
    ].filter(Boolean);
    bridge.updateBlockStyleCss(
      tiers.length > 0
        ? ['@layer kometio.class, kometio.instance;', ...tiers].join('\n')
        : '',
    );
  }

  return { refresh };
}
