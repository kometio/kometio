import { z } from 'zod';
import { isLinkableUrl } from '@kometio/theme-runtime';
import {
  backfillBlockIds,
  BLOCK_PROPS_SCHEMAS,
  GENERATION_PLACEHOLDERS,
  type Block,
} from '@kometio/shared-types';
import {
  GENERATION_CATALOG,
  isGenerableType,
  type GenerableBlock,
  type GenerableType,
} from './generation-catalog';
import { GENERATED_BLOCK_SCHEMAS } from './generation-output';

/** Why a generated block did not make it onto the page. */
export type DroppedReason =
  | 'unknown-type'
  | 'invalid-props'
  | 'duplicate-ref'
  | 'unknown-parent'
  | 'not-allowed-here'
  | 'parent-dropped'
  | 'too-many-blocks';

export interface DroppedBlock {
  /** The model's reference for it, when it gave a usable one. */
  ref: string | null;
  type: string | null;
  reason: DroppedReason;
}

export interface AssembledPage {
  content: Block[];
  dropped: DroppedBlock[];
  /** How many blocks carry a placeholder the person still has to replace. */
  placeholderCount: number;
}

export interface AssembleOptions {
  /** The page's language: placeholders are written in it (English otherwise). */
  locale: string;
  /** Whether the active theme draws this icon; one it does not is removed. */
  hasIcon: (name: string) => boolean;
}

/**
 * A page larger than any landing page needs, and a bound on what one
 * answer can put in front of the person.
 */
export const MAX_GENERATED_BLOCKS = 120;

interface Placed {
  block: Block;
  type: GenerableType;
}

const answerShape = z.object({ blocks: z.array(z.unknown()) });
const loose = z.object({ ref: z.string(), type: z.string() }).partial();

/**
 * Puts a model's flat answer back together as the page's block tree,
 * keeping every block that is valid where it stands and dropping, with a
 * reason, every one that is not — a single bad block costs that block (and
 * what it held), never the page.
 *
 * A block may only name a parent that came BEFORE it: that makes a cycle
 * impossible without having to look for one.
 */
export function assembleGeneratedPage(
  answer: unknown,
  options: AssembleOptions,
): AssembledPage {
  const dropped: DroppedBlock[] = [];
  const parsed = answerShape.safeParse(answer);
  if (!parsed.success) {
    return { content: [], dropped: [], placeholderCount: 0 };
  }

  const placeholders = placeholderTextFor(options.locale);
  const roots: Block[] = [];
  const placed = new Map<string, Placed>();
  const droppedRefs = new Set<string>();
  let placeholderCount = 0;

  for (const [index, entry] of parsed.data.blocks.entries()) {
    const hint = loose.safeParse(entry);
    const ref = hint.success ? (hint.data.ref ?? null) : null;
    const hintedType = hint.success ? (hint.data.type ?? null) : null;
    const drop = (reason: DroppedReason) => {
      // Reported back as the model wrote them, so bounded: a hostile
      // answer does not get to fill the response with its own text.
      dropped.push({
        ref: reported(ref),
        type: reported(hintedType),
        reason,
      });
      if (ref !== null) droppedRefs.add(ref);
    };

    if (index >= MAX_GENERATED_BLOCKS) {
      drop('too-many-blocks');
      continue;
    }
    if (hintedType === null || !isGenerableType(hintedType)) {
      drop('unknown-type');
      continue;
    }
    const schema = GENERATED_BLOCK_SCHEMAS.get(hintedType);
    const generated = schema?.safeParse(entry);
    if (!generated?.success) {
      drop('invalid-props');
      continue;
    }
    const { ref: ownRef, parent, props } = generated.data;
    if (placed.has(ownRef) || droppedRefs.has(ownRef)) {
      dropped.push({
        ref: reported(ownRef),
        type: hintedType,
        reason: 'duplicate-ref',
      });
      continue;
    }

    const spec: GenerableBlock = GENERATION_CATALOG[hintedType];
    let holder: Placed | null = null;
    if (parent !== null) {
      const found = placed.get(parent);
      if (!found) {
        drop(droppedRefs.has(parent) ? 'parent-dropped' : 'unknown-parent');
        continue;
      }
      holder = found;
    }
    const holderSpec: GenerableBlock | null =
      holder === null ? null : GENERATION_CATALOG[holder.type];
    const allowed =
      holderSpec === null
        ? spec.root
        : holderSpec.children?.includes(hintedType) === true;
    if (!allowed) {
      drop('not-allowed-here');
      continue;
    }

    const withServerProps: Record<string, unknown> = {
      ...props,
      ...spec.fixed,
    };
    for (const [key, placeholder] of Object.entries(spec.placeholders ?? {})) {
      withServerProps[key] = placeholders[placeholder];
    }
    if (
      typeof withServerProps['icon'] === 'string' &&
      !options.hasIcon(withServerProps['icon'])
    ) {
      // Left out, not set to null: the block's own default applies — none
      // for most, List's star — and a List's icon may not be null at all.
      delete withServerProps['icon'];
    }
    // A model's answer is untrusted text: a link it writes may only lead
    // somewhere (see isLinkableUrl), never run.
    if (
      typeof withServerProps['url'] === 'string' &&
      !isLinkableUrl(withServerProps['url'])
    ) {
      withServerProps['url'] = '';
    }

    const valid = BLOCK_PROPS_SCHEMAS[hintedType].safeParse(withServerProps);
    if (!valid.success) {
      drop('invalid-props');
      continue;
    }

    const block: Block = { type: hintedType, props: valid.data };
    if (spec.placeholders || spec.fillIn) placeholderCount += 1;
    if (holder === null) {
      roots.push(block);
    } else {
      holder.block.children = [...(holder.block.children ?? []), block];
    }
    placed.set(ownRef, { block, type: hintedType });
  }

  return {
    content: backfillBlockIds(roots).content,
    dropped,
    placeholderCount,
  };
}

// eslint-disable-next-line no-control-regex -- stripping control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** A model's own words, as short plain text: 100 characters, no control characters. */
export function reported(text: string | null): string | null {
  return text === null
    ? null
    : text.replace(CONTROL_CHARACTERS, '').slice(0, 100);
}

function placeholderTextFor(locale: string) {
  const language = locale.toLowerCase().split('-')[0];
  return language === 'it'
    ? GENERATION_PLACEHOLDERS.it
    : GENERATION_PLACEHOLDERS.en;
}
