import { headerFooterBlocks, pageBlocks } from '@kometio/block-registry';
import { isTranslationKey, Translator } from '@kometio/theme-runtime';

const DESCRIPTOR_BY_TYPE = new Map(
  [...pageBlocks, ...headerFooterBlocks].map((block) => [block.type, block]),
);

/**
 * The translated name of the ONLY child type a container accepts, or null.
 *
 * Tabs takes a Tab and nothing else, Accordion an AccordionItem, Timeline
 * a TimelineStep. Naming it turns the empty-container hint from a prompt
 * into an instruction — the alternative is telling somebody to "pick an
 * element" and letting them find, by trying, that fifty-three of the
 * fifty-four are refused.
 *
 * Null for a container that genuinely takes anything (Container, Column):
 * there is no single answer to name, and inventing one would be worse
 * than the generic sentence.
 */
export function onlyAllowedChildLabel(
  type: string,
  locale: string,
): string | null {
  const allowed = DESCRIPTOR_BY_TYPE.get(type)?.allowedChildTypes;
  if (!allowed || allowed.length !== 1) return null;
  const [onlyType] = allowed;
  const child =
    onlyType === undefined ? undefined : DESCRIPTOR_BY_TYPE.get(onlyType);
  if (!child) return null;
  // The label is an i18n key on the descriptor (`blocks.tab.label`), the
  // same one the editor's own inserter shows. One this catalogue does not
  // have is shown as it is, which is what the translator would have done.
  return isTranslationKey(child.label)
    ? new Translator(locale).t(child.label)
    : child.label;
}
