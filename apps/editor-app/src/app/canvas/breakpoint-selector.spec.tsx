import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../components/ui/tooltip';
import { BREAKPOINT_MAX_WIDTHS } from '@kometio/shared-types';
import { BREAKPOINT_WIDTHS, BreakpointSelector } from './breakpoint-selector';

describe('BreakpointSelector', () => {
  it('renders one button per breakpoint, marking the current one pressed', () => {
    render(
      <TooltipProvider>
        <BreakpointSelector value="tablet" onChange={vi.fn()} />
      </TooltipProvider>,
    );

    expect(
      screen
        .getByRole('button', { name: new RegExp(`^Desktop`) })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen
        .getByRole('button', { name: new RegExp(`^Tablet`) })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: new RegExp(`^Mobile`) })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  // The word alone would not say that a SIZE is meant rather than a
  // device, and a label left holding a raw `{{tablet}}` would say it even
  // less — matching on the prefix alone would not notice either.
  it('puts the measurement beside the word', () => {
    render(
      <TooltipProvider>
        <BreakpointSelector value="base" onChange={vi.fn()} />
      </TooltipProvider>,
    );

    const label = screen
      .getByRole('button', { name: new RegExp('^Tablet') })
      .getAttribute('aria-label');
    expect(label).toContain(String(BREAKPOINT_MAX_WIDTHS.tablet));
    expect(label).not.toContain('{{');
  });

  it('calls onChange with the clicked breakpoint', () => {
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <BreakpointSelector value="base" onChange={onChange} />
      </TooltipProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^Mobile`) }),
    );

    expect(onChange).toHaveBeenCalledWith('mobile');
  });
});

/**
 * The check that would have caught the mismatch ADR-0047 found: before
 * it, the selector previewed "Tablet" at 768px while a value saved under
 * `tablet` applies at most 1024px — so previewing Tablet actually showed
 * the MOBILE styles, and nothing anywhere failed.
 */
describe('each preview width falls inside the band it previews', () => {
  it('previews tablet inside the tablet band, clear of mobile', () => {
    const width = BREAKPOINT_WIDTHS.tablet;
    expect(width).toBeDefined();
    expect(width).toBeLessThanOrEqual(BREAKPOINT_MAX_WIDTHS.tablet);
    expect(width).toBeGreaterThan(BREAKPOINT_MAX_WIDTHS.mobile);
  });

  it('previews mobile inside the mobile band', () => {
    const width = BREAKPOINT_WIDTHS.mobile;
    expect(width).toBeDefined();
    expect(width).toBeLessThanOrEqual(BREAKPOINT_MAX_WIDTHS.mobile);
  });

  // Not a width at all: the base size is whatever room the canvas has,
  // which on any real screen is wider than the tablet band.
  it('leaves the base size unconstrained', () => {
    expect(BREAKPOINT_WIDTHS.base).toBeUndefined();
  });
});
