import { describe, expect, it } from 'vitest';
import { pageStatusBadge } from './page-status';

describe('pageStatusBadge', () => {
  it('draws a draft as a quiet draft, whatever its changes', () => {
    expect(pageStatusBadge('draft', false)).toEqual({
      key: 'pages.list.statusDraft',
      variant: 'secondary',
    });
    // There is nothing online for a draft to differ from.
    expect(pageStatusBadge('draft', true)).toEqual({
      key: 'pages.list.statusDraft',
      variant: 'secondary',
    });
  });

  it('draws a published page as published, in the success colour', () => {
    expect(pageStatusBadge('published', false)).toEqual({
      key: 'pages.list.statusPublished',
      variant: 'success',
    });
  });

  it('warns about a published page whose draft has moved on', () => {
    expect(pageStatusBadge('published', true)).toEqual({
      key: 'pages.list.statusPendingShort',
      variant: 'warning',
    });
  });
});
