import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { buildReusableSectionListItem } from '@kometio/testing/records';
import type { ReusableSectionListItem } from '../../lib/reusable-sections-api-client';
import { createTestQueryClient } from '../../test/query-client.test-fixture';
import { reusableSectionsQueryOptions } from '../sections/reusable-sections-queries';
import { TemplatePicker } from './template-picker';

function template(
  overrides: Partial<ReusableSectionListItem>,
): ReusableSectionListItem {
  return buildReusableSectionListItem({
    kind: 'template',
    status: 'published',
    publishedContent: [],
    ...overrides,
  });
}

function renderPicker(sections: ReusableSectionListItem[]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(
    reusableSectionsQueryOptions('site-1').queryKey,
    sections,
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <TemplatePicker siteId="site-1" onInsert={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('TemplatePicker', () => {
  it('lists the published templates', () => {
    renderPicker([template({ id: 'a', name: 'Scheda servizio' })]);

    expect(screen.getByText('Scheda servizio')).toBeTruthy();
    expect(screen.queryByText(/in bozza/)).toBeNull();
  });

  it('draws nothing when there are no templates at all', () => {
    const { container } = renderPicker([
      buildReusableSectionListItem({ kind: 'shared' }),
    ]);

    expect(container.textContent).toBe('');
  });

  // A template made and not published was simply missing, and looked like
  // one that had not been saved.
  it('says why a template somebody made is not in the list: it is a draft', () => {
    renderPicker([
      template({ id: 'a', name: 'Pronto' }),
      template({
        id: 'b',
        name: 'Bozza',
        status: 'draft',
        publishedContent: null,
      }),
    ]);

    expect(screen.queryByText('Bozza')).toBeNull();
    expect(
      screen.getByText(
        '1 template è in bozza: pubblicalo da Sezioni › Template per usarlo qui.',
      ),
    ).toBeTruthy();
  });

  it('says it too when every template is still a draft', () => {
    renderPicker([
      template({ id: 'a', status: 'draft', publishedContent: null }),
      template({ id: 'b', status: 'draft', publishedContent: null }),
    ]);

    expect(
      screen.getByText(
        '2 template sono in bozza: pubblicali da Sezioni › Template per usarli qui.',
      ),
    ).toBeTruthy();
  });
});
