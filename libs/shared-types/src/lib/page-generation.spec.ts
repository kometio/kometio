import { describe, expect, it } from 'vitest';
import { findPlaceholders } from './page-generation';

describe('findPlaceholders', () => {
  it('finds the placeholders left on a page, in either language and at any depth', () => {
    const found = findPlaceholders([
      {
        id: 't',
        type: 'Testimonials',
        props: {},
        children: [
          {
            id: 't1',
            type: 'Testimonial',
            props: { quote: 'Buonissimo.', author: '[Nome del cliente]' },
          },
          {
            id: 't2',
            type: 'Testimonial',
            props: { quote: 'Great.', author: 'Marta Ferri' },
          },
        ],
      },
      {
        id: 's',
        type: 'Stats',
        props: {},
        children: [
          { id: 's1', type: 'Stat', props: { value: 0, label: 'Years' } },
          { id: 's2', type: 'Stat', props: { value: 12, label: 'Shops' } },
        ],
      },
      { id: 'p', type: 'PricingPlan', props: { price: 'From [Price]' } },
    ]);

    expect(found).toEqual(
      new Map([
        ['t1', ['[Nome del cliente]']],
        ['s1', ['0']],
        ['p', ['From [Price]']],
      ]),
    );
  });
});
