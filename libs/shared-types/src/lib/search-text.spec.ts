import { describe, expect, it } from 'vitest';
import { extractSearchableText } from './search-text';
import type { PageContent, SeoMeta } from './content-model';

const seoMeta: SeoMeta = {
  title: 'Chi siamo',
  description: 'La nostra storia',
};

describe('extractSearchableText', () => {
  it('includes the SEO title and description', () => {
    const text = extractSearchableText(seoMeta, []);
    expect(text).toContain('Chi siamo');
    expect(text).toContain('La nostra storia');
  });

  it('extracts prose fields from known block types', () => {
    const blocks: PageContent = [
      { type: 'Hero', props: { title: 'Benvenuti', subtitle: 'da noi' } },
      { type: 'Text', props: { body: 'Testo del blocco' } },
      {
        type: 'Quote',
        props: { quote: 'Ottimo servizio', author: 'Mario', role: 'Cliente' },
      },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Benvenuti');
    expect(text).toContain('da noi');
    expect(text).toContain('Testo del blocco');
    expect(text).toContain('Ottimo servizio');
    expect(text).toContain('Mario');
  });

  it('walks nested children (e.g. Columns > Column > Text)', () => {
    const blocks: PageContent = [
      {
        type: 'Columns',
        props: {},
        children: [
          {
            type: 'Column',
            props: {},
            children: [{ type: 'Text', props: { body: 'Testo annidato' } }],
          },
        ],
      },
    ];

    expect(extractSearchableText(seoMeta, blocks)).toContain('Testo annidato');
  });

  it('ignores non-prose props and unlisted block types', () => {
    const blocks: PageContent = [
      {
        type: 'Button',
        props: {
          label: 'Scopri di più',
          linkType: 'url',
          url: 'https://example.com/secret-path',
          variant: 'primary',
        },
      },
      { type: 'EmbedHtml', props: { html: '<script>evil()</script>' } },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Scopri di più');
    expect(text).not.toContain('https://example.com/secret-path');
    expect(text).not.toContain('primary');
    expect(text).not.toContain('evil');
  });

  it('extracts text from Heading', () => {
    const blocks: PageContent = [
      { type: 'Heading', props: { text: 'Domande frequenti', level: 'h2' } },
    ];

    expect(extractSearchableText(seoMeta, blocks)).toContain(
      'Domande frequenti',
    );
  });

  it('extracts alt text from every image in a Gallery', () => {
    const blocks: PageContent = [
      {
        type: 'Gallery',
        props: {
          images: [{ alt: 'Foto sala' }, { alt: 'Foto cucina' }],
        },
      },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Foto sala');
    expect(text).toContain('Foto cucina');
  });

  it('extracts alt and caption from Image', () => {
    const blocks: PageContent = [
      {
        type: 'Image',
        props: { alt: 'Facciata', caption: 'Ingresso principale' },
      },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Facciata');
    expect(text).toContain('Ingresso principale');
  });

  it('extracts label from Rating, Countdown, Tab and Button', () => {
    for (const type of ['Rating', 'Countdown', 'Tab', 'Button']) {
      const text = extractSearchableText(seoMeta, [
        { type, props: { label: `Etichetta ${type}` } },
      ]);
      expect(text).toContain(`Etichetta ${type}`);
    }
  });

  it('flattens every cell of a Table', () => {
    const blocks: PageContent = [
      {
        type: 'Table',
        props: {
          rows: [
            ['Servizio', 'Prezzo'],
            ['Idraulica', '50€'],
          ],
        },
      },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Servizio');
    expect(text).toContain('Idraulica');
    expect(text).toContain('50€');
  });

  it('extracts question and answer from AccordionItem', () => {
    const blocks: PageContent = [
      {
        type: 'AccordionItem',
        props: { question: 'Fate preventivi?', answer: 'Sì, gratuiti' },
      },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Fate preventivi?');
    expect(text).toContain('Sì, gratuiti');
  });

  it('extracts title, text and buttonLabel from Banner', () => {
    const blocks: PageContent = [
      {
        type: 'Banner',
        props: {
          title: 'Offerta limitata',
          text: 'Solo questo mese',
          buttonLabel: 'Approfitta ora',
        },
      },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Offerta limitata');
    expect(text).toContain('Solo questo mese');
    expect(text).toContain('Approfitta ora');
  });

  it('extracts title and text from Feature', () => {
    const blocks: PageContent = [
      {
        type: 'Feature',
        props: { icon: '🚀', title: 'Veloce', text: 'Interventi rapidi' },
      },
    ];

    const text = extractSearchableText(seoMeta, blocks);

    expect(text).toContain('Veloce');
    expect(text).toContain('Interventi rapidi');
    expect(text).not.toContain('🚀');
  });

  it('extracts message from PromoBar, WhatsAppButton, and Callout', () => {
    for (const type of ['PromoBar', 'WhatsAppButton', 'Callout']) {
      const text = extractSearchableText(seoMeta, [
        { type, props: { message: `Messaggio ${type}` } },
      ]);
      expect(text).toContain(`Messaggio ${type}`);
    }
  });

  it('extracts label from NavLink and NavDropdown', () => {
    for (const type of ['NavLink', 'NavDropdown']) {
      const text = extractSearchableText(seoMeta, [
        { type, props: { label: `Voce ${type}` } },
      ]);
      expect(text).toContain(`Voce ${type}`);
    }
  });

  it('skips a block with missing/non-string prose props instead of throwing', () => {
    const blocks: PageContent = [
      { type: 'Hero', props: {} },
      { type: 'Gallery', props: {} },
    ];

    expect(() => extractSearchableText(seoMeta, blocks)).not.toThrow();
  });
});

/*
 * The last family of the hundred-blocks plan. Each block with words of its
 * own is found by them; the containers, whose words all live in their
 * children, add none of their own.
 */
describe('the shop, local-business and editorial blocks', () => {
  const index = (blocks: PageContent) =>
    extractSearchableText({ title: '', description: '' }, blocks);

  it.each<[string, Record<string, unknown>, string[]]>([
    [
      'ProductCard',
      { name: 'Linen shirt', description: 'Made in Italy', badge: 'New' },
      ['Linen shirt', 'Made in Italy', 'New'],
    ],
    [
      'ProductGallery',
      { images: [{ alt: 'Front view' }, { alt: 'Back view' }] },
      ['Front view', 'Back view'],
    ],
    ['DiscountPrice', { note: 'VAT included' }, ['VAT included']],
    ['BuyButton', { label: 'Buy now' }, ['Buy now']],
    [
      'ProductVariants',
      { label: 'Sizes', options: 'Small\nLarge' },
      ['Sizes', 'Small', 'Large'],
    ],
    [
      'ProductReview',
      { quote: 'Fits well', author: 'Anna', role: 'Bologna' },
      ['Fits well', 'Anna', 'Bologna'],
    ],
    [
      'Testimonial',
      { quote: 'Lovely', author: 'Marco', role: 'Client' },
      ['Lovely', 'Marco', 'Client'],
    ],
    ['ComparisonTable', { columns: 'Base\nPro' }, ['Base', 'Pro']],
    [
      'ComparisonRow',
      { feature: 'Custom domain', values: 'no\nyes' },
      ['Custom domain'],
    ],
    [
      'PromoCode',
      { code: 'SUMMER10', description: 'Ten percent off' },
      ['SUMMER10', 'Ten percent off'],
    ],
    [
      'ShippingReturns',
      {
        shippingTitle: 'Shipping',
        shippingText: '<p>Two days</p>',
        returnsTitle: 'Returns',
        returnsText: 'Thirty days',
        supportTitle: 'Help',
        supportText: 'Call us',
      },
      ['Shipping', 'Two days', 'Returns', 'Thirty days', 'Help', 'Call us'],
    ],
    ['TrustBadges', { text: 'Secure payments' }, ['Secure payments']],
    [
      'MenuItem',
      {
        name: 'Tagliatelle',
        description: 'Fresh pasta',
        dietary: 'vegan',
        allergens: 'gluten',
      },
      ['Tagliatelle', 'Fresh pasta', 'vegan', 'gluten'],
    ],
    [
      'EventItem',
      {
        title: 'Autumn concert',
        location: 'Bologna',
        description: 'Free entry',
      },
      ['Autumn concert', 'Bologna', 'Free entry'],
    ],
    ['ShareButtons', { label: 'Share this' }, ['Share this']],
    ['CookiePreferences', { label: 'Cookie settings' }, ['Cookie settings']],
    [
      'Step',
      { title: 'Choose', description: 'Pick a plan' },
      ['Choose', 'Pick a plan'],
    ],
    ['SpecItem', { label: 'Weight', value: '1.2 kg' }, ['Weight', '1.2 kg']],
    ['ProgressBar', { label: 'Fundraiser' }, ['Fundraiser']],
    [
      'ProfileCard',
      { name: 'Giulia Rossi', role: 'Founder', bio: 'Runs the shop' },
      ['Giulia Rossi', 'Founder', 'Runs the shop'],
    ],
    [
      'TeamMember',
      { name: 'Luca', role: 'Chef', bio: 'Cooks' },
      ['Luca', 'Chef', 'Cooks'],
    ],
    ['FileList', { title: 'Downloads' }, ['Downloads']],
    [
      'GlossaryTerm',
      { term: 'Anchor', definition: '<p>A point a link lands on</p>' },
      ['Anchor', 'A point a link lands on'],
    ],
    [
      'PullQuote',
      { quote: 'Design is how it works', author: 'Someone', role: 'Designer' },
      ['Design is how it works', 'Someone', 'Designer'],
    ],
    ['ImageHotspots', { alt: 'The editor' }, ['The editor']],
    [
      'Hotspot',
      { title: 'Top left', text: 'Opens downwards' },
      ['Top left', 'Opens downwards'],
    ],
    [
      'MasonryGallery',
      { images: [{ alt: 'Portrait' }, { alt: 'Landscape' }] },
      ['Portrait', 'Landscape'],
    ],
  ])('indexes the words of %s', (type, props, words) => {
    const text = index([{ type, props }]);
    for (const word of words) {
      expect(text).toContain(word);
    }
  });

  it('skips a picture list entry that is not a picture instead of throwing', () => {
    expect(
      index([
        {
          type: 'MasonryGallery',
          props: { images: [null, 'x', { alt: 'Kept' }] },
        },
        { type: 'ProductGallery', props: { images: 'not a list' } },
      ]),
    ).toBe('Kept');
  });

  it.each([
    'ProductGrid',
    'ProductReviews',
    'RestaurantMenu',
    'EventList',
    'Steps',
    'SpecList',
    'Glossary',
    'VideoPlaylist',
    'StickyContactBar',
    'BookingEmbed',
  ])('adds nothing of its own for %s', (type) => {
    expect(
      index([
        {
          type,
          props: { title: 'Not indexed', url: 'https://example.com' },
          children: [{ type: 'Text', props: { body: 'Child words' } }],
        },
      ]),
    ).toBe('Child words');
  });
});

describe('the blocks search used to miss', () => {
  const index = (blocks: PageContent) =>
    extractSearchableText({ title: '', description: '' }, blocks);

  it.each<[string, Record<string, unknown>, string[]]>([
    [
      'BeforeAfter',
      { beforeLabel: 'Prima del restauro', afterLabel: 'Dopo il restauro' },
      ['Prima del restauro', 'Dopo il restauro'],
    ],
    [
      'Code',
      { code: 'export default defineConfig({ output })', language: 'ts' },
      ['defineConfig'],
    ],
    [
      'ImageSlider',
      { images: [{ alt: 'Cucina prima' }, { alt: 'Cucina dopo' }] },
      ['Cucina prima', 'Cucina dopo'],
    ],
    ['Link', { label: 'Scarica il listino' }, ['Scarica il listino']],
    [
      'LogoStrip',
      { logos: [{ alt: 'Comune di Bologna' }, { alt: 'Acme SpA' }] },
      ['Comune di Bologna', 'Acme SpA'],
    ],
    [
      'MapEmbed',
      { address: 'Via Rizzoli 4, Bologna' },
      ['Via Rizzoli 4, Bologna'],
    ],
    [
      'NewsletterSignup',
      { title: 'Resta aggiornato', buttonLabel: 'Iscriviti' },
      ['Resta aggiornato', 'Iscriviti'],
    ],
    [
      'PricingPlan',
      { name: 'Professionale', buttonLabel: 'Attiva ora' },
      ['Professionale', 'Attiva ora'],
    ],
    ['Stat', { label: 'Clienti soddisfatti' }, ['Clienti soddisfatti']],
    [
      'TimelineStep',
      { label: '2019', title: 'Apertura', description: 'Il primo negozio' },
      ['2019', 'Apertura', 'Il primo negozio'],
    ],
    [
      'VideoEmbed',
      { caption: 'Il laboratorio', url: 'https://youtu.be/abc' },
      ['Il laboratorio'],
    ],
  ])('indexes %s', (type, props, expected) => {
    const text = index([{ type, props }]);
    for (const word of expected) {
      expect(text).toContain(word);
    }
  });

  /*
   * A number with its unit matches across pages that share nothing: every
   * plan on the site says "al mese", and "29" is a price, a year and a
   * street number. The plan's name is what someone types.
   */
  it('leaves prices, units and addresses-as-URLs out', () => {
    const text = index([
      {
        type: 'PricingPlan',
        props: {
          name: 'Professionale',
          price: '29',
          period: 'al mese',
          buttonLabel: 'Attiva',
        },
      },
      { type: 'Stat', props: { label: 'Clienti', prefix: '+', suffix: '%' } },
      {
        type: 'VideoEmbed',
        props: { url: 'https://youtu.be/abc', caption: '' },
      },
    ]);

    expect(text).toContain('Professionale');
    expect(text).toContain('Clienti');
    expect(text).not.toContain('al mese');
    expect(text).not.toContain('29');
    expect(text).not.toContain('youtu.be');
  });

  /*
   * The trail and the search field read the same on every page that draws
   * them: indexing them would answer "home" with the whole site.
   */
  it('leaves the furniture out', () => {
    const text = index([
      { type: 'Breadcrumb', props: { homeLabel: 'Home' } },
      { type: 'SearchBox', props: { placeholder: 'Cerca nel sito' } },
    ]);

    expect(text.trim()).toBe('');
  });

  /*
   * An arrangement's words belong to its children, and the children are
   * walked already — counting them twice would not make the page any
   * easier to find, and hides which block actually says them.
   */
  it("takes a container's words from its children, not the container", () => {
    const text = index([
      {
        type: 'Timeline',
        props: { label: 'non indicizzata' },
        children: [
          {
            type: 'TimelineStep',
            props: { label: '2019', title: 'Apertura', description: '' },
          },
        ],
      },
    ]);

    expect(text).toContain('Apertura');
    expect(text).not.toContain('non indicizzata');
  });
});

describe('rich text in the index', () => {
  // Without stripping, a search for "strong" would match every emphasised
  // word on the site, and a search for the phrase around a link would
  // match nothing because the address sits in the middle of it.
  it('indexes the words, not the markup', () => {
    const text = extractSearchableText({ title: '', description: '' }, [
      {
        id: 'a',
        type: 'Text',
        props: {
          body: '<p>come ho <a href="/it/guida">spiegato qui</a></p>',
        },
      },
    ]);

    expect(text).toBe('come ho spiegato qui');
    expect(text).not.toContain('href');
    expect(text).not.toContain('<');
  });

  it('keeps paragraphs apart, so the last word of one is still findable', () => {
    expect(
      extractSearchableText({ title: '', description: '' }, [
        {
          id: 'a',
          type: 'Text',
          props: { body: '<p>primo</p><p>secondo</p>' },
        },
      ]),
    ).toBe('primo secondo');
  });

  it('leaves a value written before rich text existed exactly as it was', () => {
    expect(
      extractSearchableText({ title: '', description: '' }, [
        { id: 'a', type: 'Text', props: { body: 'Costa < 10 euro > 5' } },
      ]),
    ).toBe('Costa < 10 euro > 5');
  });
});
