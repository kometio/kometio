import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TranslationAvailabilityBadges } from './translation-availability-badges';

describe('TranslationAvailabilityBadges', () => {
  it('shows a badge for every enabled locale, in order', () => {
    render(
      <TranslationAvailabilityBadges
        translations={[
          {
            locale: 'it',
            slug: 'home',
            title: 'home',
            status: 'published',
            isDiverged: false,
            hasUnpublishedChanges: false,
          },
        ]}
        enabledLocales={['it', 'en']}
      />,
    );

    expect(screen.getByText('it')).toBeTruthy();
    expect(screen.getByText('en')).toBeTruthy();
  });

  it('marks a locale with no translation as missing (muted)', () => {
    render(
      <TranslationAvailabilityBadges
        translations={[]}
        enabledLocales={['it']}
      />,
    );

    const badge = screen.getByText('it').closest('[data-slot="badge"]');
    expect(badge?.className).toContain('opacity-60');
  });

  it('marks a published translation with the success variant, not the brand accent', () => {
    render(
      <TranslationAvailabilityBadges
        translations={[
          {
            locale: 'it',
            slug: 'home',
            title: 'home',
            status: 'published',
            isDiverged: false,
            hasUnpublishedChanges: false,
          },
        ]}
        enabledLocales={['it']}
      />,
    );

    const badge = screen.getByText('it').closest('[data-slot="badge"]');
    // `default` is the accent, so a state used to be painted in the brand
    // colour — the one thing on the screen wearing it was a status.
    expect(badge?.getAttribute('data-variant')).toBe('success');
  });

  /*
   * "Published, but the draft has moved on" was the only saturated colour
   * in the interface: `bg-amber-500 text-amber-950` written at the call
   * site, which read as an error rather than as work waiting to go out.
   */
  it('marks a translation with unpublished changes with the warning variant', () => {
    render(
      <TranslationAvailabilityBadges
        translations={[
          {
            locale: 'it',
            slug: 'home',
            title: 'home',
            status: 'published',
            isDiverged: false,
            hasUnpublishedChanges: true,
          },
        ]}
        enabledLocales={['it']}
      />,
    );

    const badge = screen.getByText('it').closest('[data-slot="badge"]');
    expect(badge?.getAttribute('data-variant')).toBe('warning');
    expect(badge?.className).not.toContain('amber');
  });

  it('marks a draft translation with the outline variant', () => {
    render(
      <TranslationAvailabilityBadges
        translations={[
          {
            locale: 'it',
            slug: 'home',
            title: 'home',
            status: 'draft',
            isDiverged: false,
            hasUnpublishedChanges: false,
          },
        ]}
        enabledLocales={['it']}
      />,
    );

    const badge = screen.getByText('it').closest('[data-slot="badge"]');
    expect(badge?.getAttribute('data-variant')).toBe('outline');
  });

  it('shows the diverged mark only for a diverged translation', () => {
    render(
      <TranslationAvailabilityBadges
        translations={[
          {
            locale: 'it',
            slug: 'home',
            title: 'home',
            status: 'published',
            isDiverged: true,
            hasUnpublishedChanges: false,
          },
          {
            locale: 'en',
            slug: 'home-en',
            title: 'home-en',
            status: 'published',
            isDiverged: false,
            hasUnpublishedChanges: false,
          },
        ]}
        enabledLocales={['it', 'en']}
      />,
    );

    const itBadge = screen.getByText('it').closest('[data-slot="badge"]');
    const enBadge = screen.getByText('en').closest('[data-slot="badge"]');
    expect(itBadge?.querySelector('svg')).toBeTruthy();
    expect(enBadge?.querySelector('svg')).toBeNull();
  });
});
