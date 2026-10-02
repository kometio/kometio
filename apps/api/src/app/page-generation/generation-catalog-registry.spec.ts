import { pageBlocks } from '@kometio/block-registry';
import { GENERATION_CATALOG } from '@kometio/application';

/*
 * The generation catalogue lives in @kometio/application, which may not
 * depend on the editor's block registry; this is where the two meet. A
 * nesting the catalogue allows and the editor refuses would give the
 * person a generated page they could not have built, and could not fix.
 */
describe('the generation catalogue against the block registry', () => {
  const descriptors = new Map(pageBlocks.map((d) => [d.type, d]));

  it.each(Object.entries(GENERATION_CATALOG))(
    'only nests %s the way the editor allows',
    (type, spec) => {
      const parent = descriptors.get(type);
      expect(parent).toBeDefined();
      const children: readonly string[] =
        'children' in spec ? spec.children : [];
      if (children.length > 0) expect(parent?.isContainer).toBe(true);
      for (const childType of children) {
        const child = descriptors.get(childType);
        expect(child).toBeDefined();
        if (parent?.allowedChildTypes) {
          expect(parent.allowedChildTypes).toContain(childType);
        }
        if (child?.allowedParentTypes) {
          expect(child.allowedParentTypes).toContain(type);
        }
      }
      if (spec.root && parent?.allowedParentTypes) {
        throw new Error(`${type} is root in the catalogue but needs a parent`);
      }
    },
  );
});
