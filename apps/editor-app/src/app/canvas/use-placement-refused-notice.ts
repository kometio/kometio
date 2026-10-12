import type { BlockDescriptor } from '@kometio/block-registry';
import { useTranslation } from '../../lib/use-translation';
import { useToast } from '../shell/toast-provider';

/**
 * What to do when a block is aimed somewhere that will not have it.
 *
 * A block that belongs inside one kind of container (a Column, a Tab) can be
 * aimed somewhere that will not have it — pasted with only the page around
 * it, say. Saying so beats a click that does nothing.
 *
 * A plain function returned each render, as it was when it lived in the
 * shell: it is read when a gesture ends, not subscribed to.
 */
export function usePlacementRefusedNotice(
  registry: BlockDescriptor[],
): (blockTypes: string[]) => void {
  const { t, tLabel } = useTranslation();
  const { toast } = useToast();

  return function notifyPlacementRefused(blockTypes: string[]): void {
    const refused = blockTypes
      .map((type) => registry.find((d) => d.type === type))
      .find((descriptor) => descriptor?.allowedParentTypes?.length);
    if (!refused?.allowedParentTypes) {
      return;
    }
    toast(
      t('canvas.placement.refused', {
        block: tLabel(refused.label),
        parents: refused.allowedParentTypes
          .map((type) =>
            tLabel(registry.find((d) => d.type === type)?.label ?? type),
          )
          .join(', '),
      }),
      'destructive',
    );
  };
}
