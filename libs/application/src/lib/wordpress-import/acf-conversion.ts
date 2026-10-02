import { randomUUID } from 'node:crypto';
import type { Block, PickedMedia, PickedPage } from '@kometio/shared-types';

/**
 * What a value can be turned into that this converter cannot invent.
 *
 * A WordPress image is an attachment id or a URL on the old site; a Kometio
 * `Image` wants a media row that exists here. So the converter asks — and
 * during the analysis, where nothing has been imported and nothing is
 * being written, the answer is always `null`. That is what lets the same
 * code count what it would produce before it produces it.
 */
export interface AcfConversionResolvers {
  resolveMedia(reference: string | number): PickedMedia | null;
  resolvePage(reference: string | number): PickedPage | null;
}

export interface AcfConversionResult {
  blocks: Block[];
  /** Fields that held content this could not place, by path and type. */
  unconverted: { name: string; type: string }[];
  /** Fields passed over because they configure rather than say anything. */
  settingsSkipped: number;
}

export function block(type: string, props: Record<string, unknown>): Block {
  // Every block written needs an id, or a per-language overlay can never
  // attach to it (see `fieldValues` on PageTranslation).
  return { id: randomUUID(), type, props };
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * How ACF points at an attachment, which depends on how the field was
 * configured: its id, its URL, or the whole attachment as an array.
 */
export function mediaReference(value: unknown): string | number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (value !== null && typeof value === 'object') {
    const attachment = value as { ID?: unknown; id?: unknown; url?: unknown };
    for (const candidate of [attachment.ID, attachment.id, attachment.url]) {
      if (typeof candidate === 'number') return candidate;
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }
  }
  return null;
}
