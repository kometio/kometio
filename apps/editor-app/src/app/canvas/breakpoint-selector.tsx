import {
  BREAKPOINT_MAX_WIDTHS,
  type StyleBreakpoint,
} from '@kometio/shared-types';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../common/icon-button';

/**
 * The same three keys a style is stored under (`base`/`tablet`/`mobile`),
 * not a private `desktop|tablet|mobile` of the editor's own.
 *
 * They were separate until ADR-0047, and two vocabularies for one set of
 * sizes is how the preview and the styling drift apart without anything
 * failing: the selector said `tablet` at 768px while a value saved under
 * `tablet` applied at most 1024px, so previewing "Tablet" showed the
 * MOBILE styles. Sharing the type makes the picked size and the key
 * written to literally the same value.
 */
export type Breakpoint = StyleBreakpoint;

/**
 * How wide to make the iframe for each size. `base` = undefined = the full
 * available width, the long-standing behaviour (see canvas-frame.tsx).
 *
 * These are device-shaped widths rather than each band's own maximum,
 * because a "Mobile" preview 768px wide looks like a tablet and nobody
 * would trust it. What matters is that each one falls INSIDE the band it
 * previews and outside the narrower one — which is not obvious by
 * reading, so `breakpoint-selector.spec.tsx` checks it against
 * `BREAKPOINT_MAX_WIDTHS` instead of leaving it to a careful reader.
 */
export const BREAKPOINT_WIDTHS: Record<Breakpoint, number | undefined> = {
  base: undefined,
  tablet: BREAKPOINT_MAX_WIDTHS.tablet,
  mobile: 375,
};

export interface BreakpointSelectorProps {
  value: Breakpoint;
  onChange: (value: Breakpoint) => void;
  /** What the group of buttons is called. Defaults to the canvas wording, where the choice also resizes the preview; the block styles on the Style page have no preview to resize and say so instead. */
  label?: string;
}

export function BreakpointSelector({
  value,
  onChange,
  label,
}: BreakpointSelectorProps) {
  const { t } = useTranslation();
  // The measurement travels with the word. `Tablet` alone costs nothing to
  // somebody arriving from another builder, but the number is what makes
  // it obvious that a SIZE is meant and not a device — which matters here,
  // because the size measured is the room the block has, not the screen's
  // (ADR-0047).
  const bands = {
    tablet: BREAKPOINT_MAX_WIDTHS.tablet,
    mobile: BREAKPOINT_MAX_WIDTHS.mobile,
  };
  return (
    <div
      role="group"
      aria-label={label ?? t('canvas.breakpointGroup')}
      className="flex items-center gap-0.5"
    >
      <IconButton
        label={t('canvas.breakpointDesktop', bands)}
        variant={value === 'base' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'base'}
        onClick={() => onChange('base')}
      >
        <Monitor />
      </IconButton>
      <IconButton
        label={t('canvas.breakpointTablet', bands)}
        variant={value === 'tablet' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'tablet'}
        onClick={() => onChange('tablet')}
      >
        <Tablet />
      </IconButton>
      <IconButton
        label={t('canvas.breakpointMobile', bands)}
        variant={value === 'mobile' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'mobile'}
        onClick={() => onChange('mobile')}
      >
        <Smartphone />
      </IconButton>
    </div>
  );
}
